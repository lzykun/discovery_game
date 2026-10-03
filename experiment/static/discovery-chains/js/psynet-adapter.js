/* Thin PsyNet bridge for the upstream discovery-chains task.
 * The upstream files own display, keyboard handling, fusions, message browsing,
 * notebook behavior, and composer validation. This adapter only starts the right
 * section for PsyNet and submits the upstream state through psynet.nextPage().
 */
(function () {
  const definition = window.discoveryTrialDefinition;
  const originalHideAndShowNext = window.hideAndShowNext;
  let adapterSpentActions = 0;

  const originalScrollIntoView = Element.prototype.scrollIntoView;
  Element.prototype.scrollIntoView = function (...args) {
    if (
      this.closest &&
      (
        this.closest('#task-recipe-table') ||
        this.closest('#task-reward-table') ||
        this.id === 'task' ||
        this.id === 'task-grid'
      )
    ) {
      return;
    }
    return originalScrollIntoView.apply(this, args);
  };

  function sanitizeForPsyNet(text) {
    return String(text || '').replace(/["'`\\@#$%^*]/g, '').replace(/\s+/g, ' ').trim();
  }

  function valuesWithIds(obj) {
    return Object.entries(obj || {}).map(([id, value]) => ({ id, ...value }));
  }

  function currentActionData() {
    return typeof actionData === 'undefined' ? {} : actionData;
  }

  function currentEventData() {
    return typeof eventData === 'undefined' ? {} : eventData;
  }

  function currentNotesData() {
    return typeof notesData === 'undefined' ? {} : notesData;
  }

  function currentSubjectData() {
    return typeof subjectData === 'undefined' ? {} : subjectData;
  }

  function harvestedRewards() {
    return valuesWithIds(currentActionData())
      .filter(action => ['consume', 'harvest'].includes(action.action) && Number(action.points || 0) > 0)
      .map(action => ({ item: action.held, points: action.points, action_id: action.id }));
  }

  function timingData() {
    const subject = currentSubjectData();
    return {
      instruction_ms: subject.instruction_duration || 0,
      messages_browse_ms: subject.messages_browse_duration || 0,
      messages_reflect_ms: subject.messages_reflect_duration || 0,
      game_ms: subject.task_duration || 0,
      composition_ms: subject.composition_duration || 0,
    };
  }

  function buildAnswer() {
    const notes = currentNotesData();
    const outgoing = {
      messageHow: sanitizeForPsyNet(document.getElementById('composer-text-how').value),
      messageRules: sanitizeForPsyNet(document.getElementById('composer-text-rules').value),
    };
    return {
      chain_id: definition.chain_id,
      condition: definition.condition,
      generation_index: definition.generation_index,
      trial_index_within_generation: definition.trial_index_within_generation,
      participant_id_hint: definition.participant_id,
      game_config: definition.game_config,
      incoming_message_set: definition.incoming_message_set,
      game: {
        total_points: typeof POINTS === 'undefined' ? 0 : POINTS,
        actions_remaining: typeof ACTIONS === 'undefined' ? 0 : ACTIONS,
        actions: valuesWithIds(currentActionData()),
        events: valuesWithIds(currentEventData()),
        transitions: typeof transitions === 'undefined' ? [] : transitions,
        harvested_rewards: harvestedRewards(),
        final_position: typeof playerPosition === 'undefined' ? null : playerPosition,
        final_carrying: typeof currentlyCarrying === 'undefined' ? null : currentlyCarrying,
      },
      messages: {
        incoming: definition.incoming_message_set,
        notebook: notes.notebook || [],
        notebook_deleted: notes.notebookDeleted || [],
        read_events: notes.msgsRead || [],
        strategy_summary: sanitizeForPsyNet(notes.summary || currentSubjectData().summary || ''),
        outgoing,
      },
      timing: timingData(),
      source: 'upstream_discovery_chains_with_psynet_adapter',
    };
  }

  window.hideAndShowNext = function (hid, sid, display, center = true) {
    if (sid === 'messages' && typeof messages_browse_start_time !== 'undefined') {
      messages_browse_start_time = new Date();
      if (typeof subjectData !== 'undefined' && typeof instruction_start_time !== 'undefined' && instruction_start_time) {
        subjectData.instruction_duration = messages_browse_start_time - instruction_start_time;
      }
    }
    return originalHideAndShowNext(hid, sid, display, center);
  };

  window.handle_submit = function () {
    const composerTextHow = document.getElementById('composer-text-how').value;
    const composerTextRules = document.getElementById('composer-text-rules').value;
    if (composerTextHow === '' || composerTextRules === '') {
      alert('Please type your message in both text areas. You will be bonused for the quality of your message.');
      return;
    }
    if (typeof task_end_time !== 'undefined' && task_end_time && typeof subjectData !== 'undefined') {
      const messageDoneTime = new Date();
      subjectData.composition_duration = messageDoneTime - task_end_time;
    }
    psynet.nextPage(buildAnswer());
  };

  window.discoveryPsyNetAdapter = {
    buildAnswer,
    finishGameForReview: function () {
      if (typeof grid_done === 'function') grid_done();
    },
  };

  function resolveDiscoveryIcon(src) {
    return String(src || '').replace(/^\.\.\/img\//, '/static/discovery-chains/img/');
  }

  if (typeof drawItem === 'function') {
    const upstreamDrawItem = drawItem;
    drawItem = function (itemId, itemIcon, type = 'grid') {
      return upstreamDrawItem(itemId, resolveDiscoveryIcon(itemIcon), type);
    };
  }

  if (typeof nameToIcon === 'function') {
    nameToIcon = function (itemName, size = '24px') {
      let item = items.find((item) => item.item_name === itemName);
      if (item) {
        return `<img src="${resolveDiscoveryIcon(item.item_icon)}" style="width:${size}; height:${size};">`;
      } else {
        return itemName;
      }
    };
  }

  function updateActionProgressBar() {
    const bar = document.getElementById('action-progress-bar');
    if (!bar || typeof ACTIONS === 'undefined' || typeof MAX_ACTIONS === 'undefined') return;
    const spentActions = Math.max(
      Object.keys(currentActionData()).length,
      adapterSpentActions,
      MAX_ACTIONS - ACTIONS
    );
    const remainingActions = Math.max(0, MAX_ACTIONS - spentActions);
    adapterSpentActions = spentActions;
    ACTIONS = remainingActions;
    const actionsText = document.getElementById('task-info-actions');
    if (actionsText) actionsText.innerHTML = remainingActions;
    const progressLabel = document.getElementById('action-progress-label');
    if (progressLabel) {
      const points = typeof POINTS === 'undefined' ? 0 : POINTS;
      progressLabel.textContent = `Points: ${points} | Actions remaining: ${remainingActions} / ${MAX_ACTIONS}`;
    }
    const pct = Math.max(0, Math.min(100, (remainingActions / MAX_ACTIONS) * 100));
    bar.style.width = `${pct}%`;
    if (pct <= 20) {
      bar.style.background = '#c0392b';
    } else if (pct <= 50) {
      bar.style.background = '#f6c445';
    } else {
      bar.style.background = 'linear-gradient(90deg, #4caf50, #f6c445)';
    }
  }

  function addActionProgressBar() {
    const taskInfo = document.getElementById('task-info');
    if (!taskInfo || document.getElementById('action-progress-wrapper')) return;
    const label = document.createElement('div');
    label.id = 'action-progress-label';
    taskInfo.insertBefore(label, taskInfo.children[1] || null);
    const wrapper = document.createElement('div');
    wrapper.id = 'action-progress-wrapper';
    wrapper.setAttribute('aria-label', 'Actions remaining');
    const bar = document.createElement('div');
    bar.id = 'action-progress-bar';
    wrapper.appendChild(bar);
    taskInfo.insertBefore(wrapper, taskInfo.children[1] || null);
    updateActionProgressBar();
    setInterval(updateActionProgressBar, 250);
  }

  if (typeof updateAction === 'function') {
    const upstreamUpdateAction = updateAction;
    updateAction = function (data) {
      upstreamUpdateAction(data);
      updateActionProgressBar();
    };
  }

  function taskComposerIsVisible() {
    const composer = document.getElementById('task-composer');
    return composer && composer.style.display !== 'none';
  }

  function visibleGridItemCount() {
    return document.querySelectorAll('#task-grid .item-image').length;
  }

  function finishIfBoardIsExhausted() {
    if (taskComposerIsVisible()) return;
    if (typeof currentlyCarrying !== 'undefined' && currentlyCarrying) return;
    if (visibleGridItemCount() === 0 && typeof grid_done === 'function') {
      grid_done();
    }
  }

  if (typeof handleSpacePress === 'function') {
    const upstreamHandleSpacePress = handleSpacePress;
    handleSpacePress = function () {
      const beforePoints = typeof POINTS === 'undefined' ? 0 : POINTS;
      const beforeTransitions = typeof transitions === 'undefined' ? 0 : transitions.length;
      upstreamHandleSpacePress();
      const afterPoints = typeof POINTS === 'undefined' ? beforePoints : POINTS;
      const afterTransitions = typeof transitions === 'undefined' ? beforeTransitions : transitions.length;
      if (
        Object.keys(currentActionData()).length <= adapterSpentActions &&
        (afterPoints !== beforePoints || afterTransitions !== beforeTransitions)
      ) {
        adapterSpentActions += 1;
      }
      updateActionProgressBar();
      finishIfBoardIsExhausted();
    };
  }

  if (typeof handleDropPress === 'function') {
    const upstreamHandleDropPress = handleDropPress;
    handleDropPress = function () {
      upstreamHandleDropPress();
      finishIfBoardIsExhausted();
    };
  }

  function normalizeStrategySummaryLayout() {
    const strategy = document.getElementById('task-strategy');
    const strategyText = document.getElementById('task-strategy-text');
    if (!strategy || !strategyText) return;
    const content = document.getElementById('task-content');
    if (content && strategy.parentElement !== content.parentElement) {
      content.parentElement.insertBefore(strategy, content);
    }
    strategy.style.height = 'auto';
    strategy.style.minHeight = '46px';
    strategy.style.overflow = 'visible';
    strategyText.style.display = 'inline';
    strategyText.style.whiteSpace = 'normal';
  }

  if (typeof handleReflectDone === 'function') {
    const upstreamHandleReflectDone = handleReflectDone;
    handleReflectDone = function () {
      upstreamHandleReflectDone();
      setTimeout(normalizeStrategySummaryLayout, 0);
      setTimeout(normalizeStrategySummaryLayout, 100);
    };
  }

  function addBoardExhaustionFinishButton() {
    const taskInfo = document.getElementById('task-info');
    if (!taskInfo || document.getElementById('psynet-finish-exhausted-board')) return;
    const button = document.createElement('button');
    button.id = 'psynet-finish-exhausted-board';
    button.className = 'big-button';
    button.textContent = 'Finish game';
    button.style.display = 'none';
    button.onclick = () => grid_done();
    taskInfo.appendChild(button);

    setInterval(() => {
      const canFinish =
        !taskComposerIsVisible() &&
        visibleGridItemCount() === 0 &&
        !(typeof currentlyCarrying !== 'undefined' && currentlyCarrying);
      button.style.display = canFinish ? 'inline-block' : 'none';
    }, 500);
  }

  function startAtPsyNetEntryPoint() {
    const welcome = document.getElementById('welcome');
    const prolific = document.getElementById('prolific_id');
    const instruction = document.getElementById('instruction');
    if (welcome) welcome.style.display = 'none';
    if (prolific) prolific.style.display = 'none';
    if (instruction) instruction.style.display = 'block';
    if (typeof subjectData !== 'undefined') {
      subjectData.prolific_id = `psynet-${definition.participant_id || 'participant'}`;
    }
    if (typeof instruction_start_time !== 'undefined') {
      instruction_start_time = new Date();
    }
    if (typeof allowRegeneration !== 'undefined') {
      allowRegeneration = Boolean(discoveryGameConfig.allow_regeneration);
    }
    normalizeStrategySummaryLayout();
    addActionProgressBar();
    addBoardExhaustionFinishButton();
  }

  startAtPsyNetEntryPoint();
})();
