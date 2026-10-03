"""
Aggregated transmission-chain implementation of the discovery-chains crystal game.

Source reference: https://github.com/zhaobn/discovery-chains at
b89fcf85a475a8757f4d0bac6238edbb2ba43ca3. The browser task preserves the
reference game's keyboard movement, pickup/fusion/harvest/drop actions,
message-reading notebook flow, and outgoing strategy/rule messages while saving
through PsyNet rather than the original PHP endpoint.
"""

from __future__ import annotations

import json
import math
import random
import re
import time
from copy import deepcopy
from typing import Any, Dict, Iterable, List

import psynet.experiment
from psynet.bot import Bot
from psynet.demography.general import ExperimentFeedback
from psynet.page import InfoPage
from psynet.timeline import Page, Timeline
from psynet.trial.chain import ChainNode, ChainTrial, ChainTrialMaker


PSYNET_SOURCE_COMMIT = "57f352b9e41a85cd6c1b18b603bcf96eddbbeed0"
REFERENCE_REPOSITORY = "https://github.com/zhaobn/discovery-chains"
REFERENCE_COMMIT = "b89fcf85a475a8757f4d0bac6238edbb2ba43ca3"

SHAPES = ["triangle", "circle", "square", "diamond"]
TEXTURES = ["plain", "checkered", "stripes", "dots"]
MAX_LEVEL = 6
PLAYER_START = {"x": 7, "y": 7}

RUN_CONFIGS: Dict[str, Dict[str, Any]] = {
    "compact": {
        "mode": "compact",
        "chains": 1,
        "conditions": ["easy"],
        "generations": 3,
        "participants_per_generation": 2,
        "message_sample_size": 10,
        "aggregation_rule": "log_points_weighted_ranked_sample",
        "random_seed": 4242,
        "grid_size": 15,
        "action_budget": 40,
        "allow_regeneration": True,
        "regeneration_delay_ms": 400,
    },
    "full": {
        "mode": "full",
        "chains": 20,
        "conditions": ["easy", "medium", "hard"],
        "generations": 3,
        "participants_per_generation": 20,
        "message_sample_size": 10,
        "aggregation_rule": "log_points_weighted_ranked_sample",
        "random_seed": 4242,
        "grid_size": 15,
        "action_budget": 40,
        "allow_regeneration": True,
        "regeneration_delay_ms": 1200,
    },
}

ACTIVE_CONFIG_NAME = "compact"
ACTIVE_CONFIG = RUN_CONFIGS[ACTIVE_CONFIG_NAME]


def sanitize_text(text: Any) -> str:
    """Keep message content readable while avoiding parser-hostile characters."""
    if text is None:
        return ""
    text = str(text)
    text = re.sub(r"[\"'`\\@#$%^*]", "", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def item_name(shape: str, texture: str, level: int) -> str:
    return f"{shape}_{texture}_{level}"


def parse_item(name: str) -> Dict[str, Any]:
    shape, texture, level = name.split("_")
    return {"shape": shape, "texture": texture, "level": int(level)}


def new_object(held: str, target: str) -> str:
    held_parts = parse_item(held)
    target_parts = parse_item(target)
    new_level = max(held_parts["level"], target_parts["level"]) + 1
    if new_level >= MAX_LEVEL:
        return ""
    return item_name(held_parts["shape"], target_parts["texture"], new_level)


def transition_succeeds(condition: str, held: str, target: str) -> bool:
    held_parts = parse_item(held)
    target_parts = parse_item(target)
    shape_sum = SHAPES.index(held_parts["shape"]) + SHAPES.index(target_parts["shape"])
    texture_sum = TEXTURES.index(held_parts["texture"]) + TEXTURES.index(target_parts["texture"])

    if condition == "easy":
        return held_parts["shape"] == target_parts["shape"]
    if condition == "medium":
        return shape_sum == 3 and held_parts["texture"] != target_parts["texture"]
    if condition == "hard":
        # The reference repository experimented with several hard variants. We
        # keep one deterministic variant under the public hard label.
        return shape_sum == 3 and (
            TEXTURES.index(held_parts["texture"]) % 2 == 0
            or TEXTURES.index(target_parts["texture"]) % 2 == 0
        )
    raise ValueError(f"Unknown condition: {condition}")


def item_points(name: str) -> int:
    return 10 ** parse_item(name)["level"]


def make_layout(
    config: Dict[str, Any],
    chain_id: int,
    condition: str,
    participant_key: str | int | None = None,
) -> List[Dict[str, Any]]:
    """Generate a reproducible per-participant random layout."""
    seed = f"{config['random_seed']}:{chain_id}:{condition}:{participant_key or 'node'}"
    rng = random.Random(seed)
    positions = {}
    used = set()
    for shape in SHAPES:
        for texture in TEXTURES:
            name = item_name(shape, texture, 0)
            while True:
                pos = (rng.randrange(config["grid_size"]), rng.randrange(config["grid_size"]))
                if pos not in used and pos != (PLAYER_START["x"], PLAYER_START["y"]):
                    positions[name] = pos
                    used.add(pos)
                    break
    return [
        {
            "item_name": name,
            "x": x,
            "y": y,
            "item_level": 0,
            "shape": parse_item(name)["shape"],
            "texture": parse_item(name)["texture"],
        }
        for name, (x, y) in sorted(positions.items())
    ]


def make_game_config(
    config: Dict[str, Any],
    chain_id: int,
    condition: str,
    participant_key: str | int | None = None,
) -> Dict[str, Any]:
    layout_seed = f"{config['random_seed']}:{chain_id}:{condition}:{participant_key or 'node'}"
    return {
        "grid_size": config["grid_size"],
        "action_budget": config["action_budget"],
        "allow_regeneration": config["allow_regeneration"],
        "regeneration_delay_ms": config["regeneration_delay_ms"],
        "player_start": deepcopy(PLAYER_START),
        "shapes": SHAPES,
        "textures": TEXTURES,
        "max_level": MAX_LEVEL,
        "condition_rule": condition,
        "items": make_layout(config, chain_id, condition, participant_key),
        "layout_seed": layout_seed,
        "layout_scope": "participant" if participant_key is not None else "node",
    }


def make_start_definition(config: Dict[str, Any], chain_id: int, condition: str) -> Dict[str, Any]:
    return {
        "chain_id": chain_id,
        "condition": condition,
        "generation_index": 0,
        "config_mode": config["mode"],
        "run_parameters": deepcopy(config),
        "game_config": make_game_config(config, chain_id, condition),
        "incoming_message_set": {
            "source_generation_index": None,
            "messages": [],
            "aggregation": None,
        },
    }


def normalized_trial_answer(trial: ChainTrial) -> Dict[str, Any]:
    answer = trial.answer or {}
    return answer if isinstance(answer, dict) else {}


def aggregate_trials(
    trials: Iterable[ChainTrial],
    definition: Dict[str, Any],
    config: Dict[str, Any],
) -> Dict[str, Any]:
    inputs: List[Dict[str, Any]] = []
    for trial in sorted(trials, key=lambda t: t.id):
        answer = normalized_trial_answer(trial)
        messages = answer.get("messages", {})
        outgoing = messages.get("outgoing", {})
        game = answer.get("game", {})
        total_points = int(game.get("total_points", 0) or 0)
        message_how = sanitize_text(outgoing.get("messageHow"))
        message_rules = sanitize_text(outgoing.get("messageRules"))
        weight = max(math.log1p(max(total_points, 0)), 0.0) + 1e-6
        inputs.append(
            {
                "trial_id": trial.id,
                "participant_id": trial.participant_id,
                "chain_id": definition["chain_id"],
                "condition": definition["condition"],
                "generation_index": definition["generation_index"],
                "trial_index_within_generation": answer.get("trial_index_within_generation"),
                "messageHow": message_how,
                "messageRules": message_rules,
                "nchar_how": len(message_how),
                "nchar_rules": len(message_rules),
                "total_points": total_points,
                "weight": weight,
            }
        )

    ranked = sorted(inputs, key=lambda row: (-row["total_points"], row["trial_id"]))
    for rank, row in enumerate(ranked, start=1):
        row["rank"] = rank

    sample_size = min(config["message_sample_size"], len(ranked))
    rng = random.Random(
        f"{config['random_seed']}:agg:{definition['chain_id']}:{definition['condition']}:{definition['generation_index']}"
    )
    if sample_size >= len(ranked):
        selected = list(ranked)
    else:
        pool = list(ranked)
        selected = []
        while len(selected) < sample_size and pool:
            total_weight = sum(row["weight"] for row in pool)
            pick = rng.random() * total_weight
            cumulative = 0.0
            for idx, row in enumerate(pool):
                cumulative += row["weight"]
                if cumulative >= pick:
                    selected.append(pool.pop(idx))
                    break
    selected = sorted(selected, key=lambda row: row["rank"])
    messages = [
        {
            "sample_id": idx,
            "source_trial_id": row["trial_id"],
            "source_participant_id": row["participant_id"],
            "source_generation_index": row["generation_index"],
            "rank": row["rank"],
            "weight": row["weight"],
            "total_points": row["total_points"],
            "messageHow": row["messageHow"],
            "messageRules": row["messageRules"],
            "nchar_how": row["nchar_how"],
            "nchar_rules": row["nchar_rules"],
        }
        for idx, row in enumerate(selected, start=1)
    ]
    return {
        "rule": config["aggregation_rule"],
        "source_generation_index": definition["generation_index"],
        "target_generation_index": definition["generation_index"] + 1,
        "chain_id": definition["chain_id"],
        "condition": definition["condition"],
        "sample_size_requested": config["message_sample_size"],
        "sample_size_actual": len(messages),
        "random_seed": f"{config['random_seed']}:agg:{definition['chain_id']}:{definition['condition']}:{definition['generation_index']}",
        "inputs": ranked,
        "selected_messages": messages,
    }


class DiscoveryChainNode(ChainNode):
    def create_initial_seed(self, experiment, participant):
        return {}

    def create_definition_from_seed(self, seed, experiment, participant):
        return seed

    def summarize_trials(self, trials: list, experiment, participant):
        return aggregate_trials(trials, self.definition, self.definition["run_parameters"])

    def make_next_definition(self, experiment, participant) -> dict:
        aggregation = self.summarize_trials(
            self.completed_and_processed_trials, experiment, participant
        )
        self.var.aggregation = aggregation
        next_definition = deepcopy(self.definition)
        next_definition["generation_index"] = self.degree + 1
        next_definition["incoming_message_set"] = {
            "source_generation_index": self.degree,
            "messages": aggregation["selected_messages"],
            "aggregation": {
                "rule": aggregation["rule"],
                "source_generation_index": aggregation["source_generation_index"],
                "target_generation_index": aggregation["target_generation_index"],
                "chain_id": aggregation["chain_id"],
                "condition": aggregation["condition"],
                "sample_size_requested": aggregation["sample_size_requested"],
                "sample_size_actual": aggregation["sample_size_actual"],
                "random_seed": aggregation["random_seed"],
                "contributor_trial_ids": [row["trial_id"] for row in aggregation["inputs"]],
                "selected_trial_ids": [
                    msg["source_trial_id"] for msg in aggregation["selected_messages"]
                ],
            },
        }
        return next_definition


def scripted_game_answer(definition: Dict[str, Any], participant_id: int | None = None) -> Dict[str, Any]:
    """Deterministic bot answer matching the browser answer schema."""
    config = definition["game_config"]
    condition = definition["condition"]
    position = deepcopy(config["player_start"])
    carrying = None
    points = 0
    actions_left = config["action_budget"]
    items = {item["item_name"]: deepcopy(item) for item in config["items"]}
    transitions: Dict[str, Dict[str, Any]] = {}
    action_records: List[Dict[str, Any]] = []
    event_records: List[Dict[str, Any]] = []
    harvested: List[Dict[str, Any]] = []

    def item_at_current_position() -> str | None:
        for name, item in items.items():
            if item.get("on_grid", True) and item["x"] == position["x"] and item["y"] == position["y"]:
                return name
        return None

    def log_event(action: str):
        event_records.append(
            {
                "event_id": f"event-{len(event_records) + 1}",
                "action": action,
                "x": position["x"],
                "y": position["y"],
                "actions_left": actions_left,
                "current_points": points,
                "currently_carrying": carrying or "",
            }
        )

    def scored_action(record: Dict[str, Any]):
        nonlocal actions_left
        actions_left -= 1
        record = dict(record)
        record["action_id"] = f"act-{len(action_records) + 1}"
        record["actions_left_after"] = actions_left
        action_records.append(record)

    def move(dx: int, dy: int, label: str):
        position["x"] += dx
        position["y"] += dy
        log_event(label)

    def space():
        nonlocal carrying, points
        target = item_at_current_position()
        if target and carrying:
            key = f"{carrying}->{target}"
            if key in transitions:
                yield_item = transitions[key]["yield"]
            else:
                yield_item = new_object(carrying, target) if transition_succeeds(condition, carrying, target) else ""
                transitions[key] = {"held": carrying, "target": target, "yield": yield_item}
            if yield_item:
                items[target]["on_grid"] = False
                parts = parse_item(yield_item)
                items[yield_item] = {
                    "item_name": yield_item,
                    "x": position["x"],
                    "y": position["y"],
                    "item_level": parts["level"],
                    "shape": parts["shape"],
                    "texture": parts["texture"],
                    "on_grid": False,
                }
                carrying = yield_item
            scored_action({"action": "combine", "held": transitions[key]["held"], "target": target, "yield": yield_item, "points": 0})
            log_event("combine")
        elif target and not carrying:
            carrying = target
            items[target]["on_grid"] = False
            log_event("pickUp")
        elif carrying and not target:
            gained = item_points(carrying)
            points += gained
            harvested.append({"item": carrying, "points": gained, "x": position["x"], "y": position["y"]})
            scored_action({"action": "harvest", "held": carrying, "target": "", "yield": "", "points": gained})
            carrying = None
            log_event("consume")

    def drop():
        nonlocal carrying
        if carrying and not item_at_current_position():
            items[carrying]["x"] = position["x"]
            items[carrying]["y"] = position["y"]
            items[carrying]["on_grid"] = True
            carrying = None
            log_event("drop")

    def move_to(x: int, y: int):
        while position["x"] < x:
            move(1, 0, "moveRight")
        while position["x"] > x:
            move(-1, 0, "moveLeft")
        while position["y"] < y:
            move(0, 1, "moveDown")
        while position["y"] > y:
            move(0, -1, "moveUp")

    def successful_pair_names():
        base_names = [
            name for name, item in items.items()
            if item.get("on_grid", True) and item["item_level"] == 0
        ]
        for held in base_names:
            for target in base_names:
                if held != target and transition_succeeds(condition, held, target):
                    return held, target
        return base_names[:2]

    for _ in range(2):
        held_name, target_name = successful_pair_names()
        held_item = items[held_name]
        target_item = items[target_name]
        move_to(held_item["x"], held_item["y"])
        space()
        move_to(target_item["x"], target_item["y"])
        space()
        if carrying:
            space()

    generation = definition["generation_index"]
    incoming = definition["incoming_message_set"]
    notes = []
    read_events = []
    if generation > 0 and incoming["messages"]:
        first_message = incoming["messages"][0]
        notes.append(
            {
                "from": "Player #1",
                "sampleId": first_message["sample_id"],
                "text": sanitize_text(first_message["messageRules"] or first_message["messageHow"]),
                "savedAt": "bot-simulated",
            }
        )
        read_events.append(
            {
                "msgEventId": "msg-1-1",
                "sampleId": first_message["sample_id"],
                "rank": first_message.get("rank", 1),
                "dwellMs": 1200,
                "openedAt": "bot-simulated",
                "closedAt": "bot-simulated",
            }
        )

    message_how = sanitize_text(
        f"Player {participant_id or 'bot'} scored {points} points by fusing same-shape crystals and harvesting the fused result."
    )
    message_rules = sanitize_text(
        "For this planet, crystals with the same shape fused reliably in my run; harvest the higher-level crystal after each successful fusion."
    )
    return {
        "chain_id": definition["chain_id"],
        "condition": definition["condition"],
        "generation_index": generation,
        "trial_index_within_generation": definition.get("trial_index_within_generation"),
        "participant_id_hint": participant_id,
        "game_config": deepcopy(config),
        "incoming_message_set": deepcopy(incoming),
        "game": {
            "total_points": points,
            "actions_remaining": actions_left,
            "actions": action_records,
            "events": event_records,
            "transitions": list(transitions.values()),
            "harvested_rewards": harvested,
            "final_position": position,
            "final_carrying": carrying,
        },
        "messages": {
            "incoming": deepcopy(incoming),
            "notebook": notes,
            "notebook_deleted": [],
            "read_events": read_events,
            "strategy_summary": sanitize_text("Focus on same-shape fusions, then harvest the upgraded crystal."),
            "outgoing": {
                "messageHow": message_how,
                "messageRules": message_rules,
            },
        },
        "timing": {
            "instruction_ms": 800,
            "messages_browse_ms": 1600 if generation > 0 else 0,
            "messages_reflect_ms": 900 if generation > 0 else 0,
            "game_ms": 3000,
            "composition_ms": 900,
        },
        "source": "psynet_bot_script",
    }


class DiscoveryGamePage(Page):
    def __init__(self, definition: Dict[str, Any], label: str, time_estimate: float):
        self.definition = definition
        template = (
            "templates/discovery-base.html"
            if definition["generation_index"] == 0
            else "templates/discovery-after.html"
        )
        super().__init__(
            label=label,
            time_estimate=time_estimate,
            template_path=template,
            js_vars={"trial_definition": definition},
            session_id=f"discovery-{definition['chain_id']}-{definition['generation_index']}-{definition.get('trial_index_within_generation', 0)}",
        )

    def get_bot_response(self, experiment, bot):
        return scripted_game_answer(self.definition, participant_id=bot.id)

    def format_answer(self, raw_answer, **kwargs):
        answer = raw_answer if isinstance(raw_answer, dict) else json.loads(raw_answer)
        outgoing = answer.setdefault("messages", {}).setdefault("outgoing", {})
        outgoing["messageHow"] = sanitize_text(outgoing.get("messageHow"))
        outgoing["messageRules"] = sanitize_text(outgoing.get("messageRules"))
        answer["chain_id"] = self.definition["chain_id"]
        answer["condition"] = self.definition["condition"]
        answer["generation_index"] = self.definition["generation_index"]
        answer["trial_index_within_generation"] = self.definition.get("trial_index_within_generation")
        answer["incoming_message_set"] = deepcopy(self.definition["incoming_message_set"])
        answer["game_config"] = deepcopy(self.definition["game_config"])
        return answer

    def validate(self, response, answer=None, **kwargs):
        answer = answer if isinstance(answer, dict) else getattr(response, "answer", {})
        outgoing = (
            answer.get("messages", {}).get("outgoing", {})
            if isinstance(answer, dict)
            else {}
        )
        if not sanitize_text(outgoing.get("messageHow")):
            return "Please write a strategy message before continuing."
        if not sanitize_text(outgoing.get("messageRules")):
            return "Please write a rule message before continuing."
        return None


class DiscoveryTrial(ChainTrial):
    time_estimate = 90

    def make_definition(self, experiment, participant):
        definition = super().make_definition(experiment, participant)
        definition["trial_index_within_generation"] = int(self.node.n_viable_trials)
        definition["participant_id"] = participant.id
        definition["game_config"] = make_game_config(
            definition["run_parameters"],
            definition["chain_id"],
            definition["condition"],
            participant_key=f"p{participant.id}-g{definition['generation_index']}",
        )
        return definition

    def show_trial(self, experiment, participant):
        return DiscoveryGamePage(
            definition=self.definition,
            label="discovery_game",
            time_estimate=self.time_estimate,
        )


def get_start_nodes() -> List[DiscoveryChainNode]:
    nodes: List[DiscoveryChainNode] = []
    for chain_id in range(ACTIVE_CONFIG["chains"]):
        for condition in ACTIVE_CONFIG["conditions"]:
            nodes.append(
                DiscoveryChainNode(
                    definition=make_start_definition(ACTIVE_CONFIG, chain_id, condition),
                    participant_group="default",
                    block=f"chain-{chain_id}-{condition}",
                )
            )
    return nodes


trial_maker = ChainTrialMaker(
    id_="discovery_chain",
    trial_class=DiscoveryTrial,
    node_class=DiscoveryChainNode,
    chain_type="across",
    start_nodes=get_start_nodes(),
    expected_trials_per_participant=1,
    max_trials_per_participant=1,
    chains_per_experiment=ACTIVE_CONFIG["chains"] * len(ACTIVE_CONFIG["conditions"]),
    chains_per_participant=None,
    max_nodes_per_chain=ACTIVE_CONFIG["generations"],
    trials_per_node=ACTIVE_CONFIG["participants_per_generation"],
    balance_across_chains=True,
    check_performance_at_end=False,
    check_performance_every_trial=False,
    recruit_mode="n_trials",
    target_n_participants=None,
    wait_for_networks=True,
    fail_trials_on_premature_exit=False,
    propagate_failure=False,
)


class Exp(psynet.experiment.Experiment):
    label = "Aggregated discovery-chain crystal game"

    timeline = Timeline(
        InfoPage(
            "You will play a crystal discovery game. Later generations may read messages aggregated from earlier players.",
            time_estimate=5,
        ),
        trial_maker,
        ExperimentFeedback(),
    )

    test_n_bots = (
        ACTIVE_CONFIG["chains"]
        * len(ACTIVE_CONFIG["conditions"])
        * ACTIVE_CONFIG["generations"]
        * ACTIVE_CONFIG["participants_per_generation"]
    )
    test_time_factor = 0.1

    def test_check_bots(self, bots: List[Bot]):
        # Give chain growth a short moment after the last finalized trial.
        time.sleep(1.0)
        trials = [trial for bot in bots for trial in bot.alive_trials]
        assert len(trials) == self.test_n_bots
        assert all(trial.finalized for trial in trials)
        by_generation: Dict[int, List[ChainTrial]] = {}
        for trial in trials:
            by_generation.setdefault(trial.answer["generation_index"], []).append(trial)
        assert sorted(by_generation) == [0, 1, 2]
        assert all(len(items) == ACTIVE_CONFIG["participants_per_generation"] for items in by_generation.values())
        gen1 = by_generation[1][0].answer["incoming_message_set"]
        gen2 = by_generation[2][0].answer["incoming_message_set"]
        assert gen1["source_generation_index"] == 0
        assert gen2["source_generation_index"] == 1
        assert len(gen1["messages"]) == ACTIVE_CONFIG["participants_per_generation"]
        assert len(gen2["messages"]) == ACTIVE_CONFIG["participants_per_generation"]
        nodes = DiscoveryChainNode.query.all()
        aggregation_nodes = [node for node in nodes if node.var.get("aggregation", None)]
        assert len(aggregation_nodes) >= 2
        super().test_check_bots(bots)
