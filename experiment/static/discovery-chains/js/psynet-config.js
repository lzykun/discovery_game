/* PsyNet adapter for upstream js/config.js.
 * This file keeps the upstream global variable contract but sources condition,
 * item layout, and action budget from the PsyNet ChainTrial definition.
 */
const discoveryDefinition = window.discoveryTrialDefinition;
const discoveryGameConfig = discoveryDefinition.game_config;

const MAX_ACTIONS = discoveryGameConfig.action_budget;
const gridSize = discoveryGameConfig.grid_size;
const conditions = discoveryDefinition.run_parameters.conditions;
const COND = discoveryDefinition.condition === "hard" ? "hard-1" : discoveryDefinition.condition;

let items = discoveryGameConfig.items.map(item => ({
  item_name: item.item_name,
  x: item.x,
  y: item.y,
  item_level: item.item_level,
  item_icon: `/static/discovery-chains/img/${item.item_name}.svg`
}));
let transitions = [];
let ACTIONS = MAX_ACTIONS;
let POINTS = 0;
const MAXLEVEL = discoveryGameConfig.max_level;

let token = `psynet-${discoveryDefinition.participant_id || 'participant'}`;
let playerPosition = { ...discoveryGameConfig.player_start };
getEl('task-info-actions').innerHTML = ACTIONS;
getEl('task-info-points').innerHTML = POINTS;

let baseItems = discoveryGameConfig.items.filter(item => item.item_level === 0).map(item => item.item_name);
let shapes = discoveryGameConfig.shapes;
let textures = discoveryGameConfig.textures;

window.discoveryMessagesByCondition = {
  [COND]: discoveryDefinition.incoming_message_set.messages || []
};

function getShape(item) { return item.split("_")[0] }

function getTexture(item) { return item.split("_")[1] }

function getLevel(item) { return item.split("_")[2] }

function newObj(item1, item2) {
  const newLevel = Math.max(getLevel(item1), getLevel(item2)) + 1;
  if(newLevel >= MAXLEVEL) {
     return ''

  } else {
    return `${getShape(item1)}_${getTexture(item2)}_${newLevel}`;
  }
}

function isSameShape(item_list) {
  return getShape(item_list[0]) === getShape(item_list[1]);
}
function diffObjs1(item_list) {
  const shapeMatch = shapes.indexOf(getShape(item_list[0])) + shapes.indexOf(getShape(item_list[1])) === 3;
  const textureMatch = getTexture(item_list[0]) != getTexture(item_list[1]);
  return shapeMatch && textureMatch;
}
function modRule(item_list) {
  const shapeMatch = shapes.indexOf(getShape(item_list[0])) + shapes.indexOf(getShape(item_list[1])) === 3;
  const textureMatch = (textures.indexOf(getTexture(item_list[0])) % 2 === 0) || (textures.indexOf(getTexture(item_list[1])) % 2 === 0);
  return shapeMatch && textureMatch;
}
function modRule2(item_list) {
  const textureMatch = textures.indexOf(getTexture(item_list[0])) + textures.indexOf(getTexture(item_list[1])) === 3;
  const shapeMatch = (shapes.indexOf(getShape(item_list[0])) % 2 === 0) || (shapes.indexOf(getShape(item_list[1])) % 2 === 0);
  return shapeMatch && textureMatch;
}
function modRule3(item_list) {
  const shapeMatch = shapes.indexOf(getShape(item_list[0])) + shapes.indexOf(getShape(item_list[1])) === 3;
  const textureMatch = (textures.indexOf(getTexture(item_list[0])) % 2 === 0) || (textures.indexOf(getTexture(item_list[1])) % 2 === 1);
  return shapeMatch && textureMatch;
}
