
const gridWorld = document.getElementById("task-grid");
let itemCount = 0;
let allowRegeneration = true;
const regeneratedItems = new Set();

let currentlyCarrying = null;
let attemptedItems = new Set();
let actionData = {};
let eventData = {};
let eventCounter = 0;

// Draw player
var hash = 'd6fe8c82fb0abac17a702fd2a94eff37';
var options = {
  foreground: [0, 0, 0, 255],
  background: [255, 255, 255, 255],
  margin: 0.05,
  size: 30,
  format: 'png'
};
var data = new Identicon(hash, options).toString();
var playerImgSrc = 'data:image/png;base64,' + data;


// Log event data
function logEvent(actionType) {
  eventCounter++;
  const eventKey = `event-${eventCounter}`;
  eventData[eventKey] = {
    timestamp: new Date().toISOString(),
    action: actionType,
    x: playerPosition.x,
    y: playerPosition.y,
    actionsLeft: ACTIONS,
    currentPoints: POINTS,
    currentlyCarrying: (currentlyCarrying === null) ? '' : currentlyCarrying,
    token: token
  }
}


// Create the grid
function createGrid() {
  for (let y = 0; y < gridSize; y++) {
    for (let x = 0; x < gridSize; x++) {
      const cell = document.createElement("div");
      cell.classList.add("grid-cell");
      cell.dataset.x = x;
      cell.dataset.y = y;

      // Add items
      const item = items.find((item) => item.x === x && item.y === y);
      if (item) {
        cell.appendChild(drawItem(item.item_name, item.item_icon));
        itemCount++;
      }

      // Add player to initial position
      if (x === playerPosition.x && y === playerPosition.y) {
        const player = document.createElement("div");
        player.classList.add("player");
        player.style.backgroundImage = `url(${playerImgSrc})`;
        cell.appendChild(player);
      }

      gridWorld.appendChild(cell);
    }
  }
}

// Helper functions
function drawItem(itemId, itemIcon, type = 'grid') {
  const itemElement = document.createElement("img");
  itemElement.src = itemIcon;
  itemElement.id = itemId;
  itemElement.classList.add("item-image");
  itemElement.style.width = (type=='grid')? "30px" : "20px";
  itemElement.style.height = (type=='grid')? "30px" : "20px";

  return itemElement;

}
function nameToIcon (itemName, size='24px') {
  let item = items.find((item) => item.item_name === itemName);
  if (item) {
    return `<img src="${item.item_icon}" style="width:${size}; height:${size};">`;

  } else {
    return itemName
  }
}
function consumeItem(itemName) {
  // Collect points
  let item = items.find((item) => item.item_name === itemName);
  let itemPoints = 10 ** item.item_level;
  POINTS += itemPoints;

  // Update inventory
  if (!attemptedItems.has(itemName)){
    attemptedItems.add(itemName);
    updateItemTable(item);
  }

  getEl("task-info-points").innerHTML = POINTS;
  updateAction({'action': 'consume', 'held': itemName, 'target': '', 'yield': '', 'points': itemPoints});
}


// Check transitions
function updateTransitions(carriedItem, targetItem) {
  const hintDiv = getEl("task-info-hint");
  let heldItemIcon = nameToIcon(carriedItem);
  let targetItemIcon = nameToIcon(targetItem);
  let yieldItemIcon = '?'

  let seenTransitions = new Set(transitions.map(record => `${record.held}-${record.target}`));

  if (seenTransitions.has(`${carriedItem}-${targetItem}`)) {
    let record = transitions.find(record => record.held === carriedItem && record.target === targetItem);
    if (record.yield.length < 1) {
      yieldItemIcon = '❌';
    } else {
      yieldItemIcon = nameToIcon(record.yield);
    }
  }

  hintDiv.innerHTML =`${heldItemIcon} + ${targetItemIcon} = ${yieldItemIcon}`;
}

// Add comsumed items back to grid
function regenerateItems(itemsToRegenerate) {
  if (!allowRegeneration) {
    return;
  }

  const baseItems = itemsToRegenerate.filter((itemName) => itemName.endsWith("_0"));

  baseItems.forEach((itemName, index) => {
    const baseWaitTime = Math.max(1000, gaussianRandom(5000, 2000));
    const staggerDelay = index * 2000;
    const waitTime = baseWaitTime + staggerDelay;

    setTimeout(() => {
      // only regenerate once
      if (regeneratedItems.has(itemName)) {
        return;
      }

      // Find random empty cell
      const emptyCells = Array.from(document.querySelectorAll(".grid-cell")).filter(
        (cell) => !cell.querySelector(".item-image") && !cell.querySelector(".player")
      );

      if (emptyCells.length > 0) {
        const randomCell = emptyCells[Math.floor(Math.random() * emptyCells.length)];
        const item = items.find((i) => i.item_name === itemName);

        if (item) {
          item.x = parseInt(randomCell.dataset.x);
          item.y = parseInt(randomCell.dataset.y);

          // Add the item back to the grid
          randomCell.appendChild(drawItem(item.item_name, item.item_icon));
          regeneratedItems.add(itemName);
        }
      }
    }, waitTime);
  });
}

// Update player position
function updatePlayerPosition() {
  document.querySelectorAll(".player").forEach((player) => player.remove());

  const playerCell = document.querySelector(
    `.grid-cell[data-x="${playerPosition.x}"][data-y="${playerPosition.y}"]`
  );

  const playerElement = document.createElement("div");
  playerElement.classList.add("player");
  playerElement.style.backgroundImage = `url(${playerImgSrc})`;
  playerCell.appendChild(playerElement);

  // Check if player is moving into an item position
  if (playerCell.querySelector(".item-image")) {
    let itemId = playerCell.querySelector(".item-image").id;
    getEl("task-info-location").innerHTML = nameToIcon(itemId);

    // Check if a transition if possible
    if (currentlyCarrying) {
      updateTransitions(currentlyCarrying, itemId);
    }

  } else {
    getEl("task-info-location").innerHTML = "";
    getEl('task-info-hint').innerHTML = '';
  }
}

// Handle player movement
function handleKeyPress(event) {
  const { x, y } = playerPosition;
  let actionType = null;

  if (event.key === "ArrowUp" && y > 0) {
    playerPosition.y--;
    actionType = "moveUp";

  } else if (event.key === "ArrowDown" && y < gridSize - 1) {
    playerPosition.y++;
    actionType = "moveDown";

  } else if (event.key === "ArrowLeft" && x > 0) {
    playerPosition.x--;
    actionType = "moveLeft";

  } else if (event.key === "ArrowRight" && x < gridSize - 1) {
    playerPosition.x++;
    actionType = "moveRight";

  }

  if (actionType) {
    logEvent(actionType);
    updatePlayerPosition();
  }
}


// Handle item pick-up or combination
function handleSpacePress() {
  const playerCell = document.querySelector(
    `.grid-cell[data-x="${playerPosition.x}"][data-y="${playerPosition.y}"]`
  );

  const itemElement = playerCell.querySelector(".item-image");
  let actionType = null;

  // If there's an item on the spot
  if (itemElement) {
    if (currentlyCarrying) {
      actionType = "combine";
      combineItem(currentlyCarrying, itemElement.id);

    } else {
      actionType = "pickUp";
      currentlyCarrying = itemElement.id;
      getEl(currentlyCarrying).remove();
      getEl("task-info-carrying").innerHTML = nameToIcon(currentlyCarrying);

      updatePlayerPosition();

    }
  } else {
    // If the spot is empty and the player is carrying an item
    if (currentlyCarrying) {
      actionType = "consume";
      consumeItem(currentlyCarrying);
      regenerateItems([currentlyCarrying]);

      currentlyCarrying = null;
      getEl("task-info-carrying").innerHTML = "";

      updatePlayerPosition();
    }
  }

  if (actionType) {
    logEvent(actionType);
  }
}

function handleDropPress() {

  if (currentlyCarrying) {
    const dropX = playerPosition.x;
    const dropY = playerPosition.y;

    const currentCell = document.querySelector(`.grid-cell[data-x="${dropX}"][data-y="${dropY}"]`);

    // Check if there is already an item in the cell
    if (currentCell.querySelector(".item-image")) {
      return;
    }

    let item = items.find((item) => item.item_name === currentlyCarrying);
    currentCell.appendChild(drawItem(currentlyCarrying, item.item_icon));

    currentlyCarrying = null;
    logEvent("drop");

  }

  updatePlayerPosition();
  getEl("task-info-carrying").innerHTML = "";

}

function updateAction(data) {

  ACTIONS = ACTIONS - 1
  const actionsSpan = document.getElementById("task-info-actions");
  actionsSpan.innerHTML = ACTIONS;
  actionsSpan.classList.add("flash");

  var actionId = 'act-' + (MAX_ACTIONS - ACTIONS);
  data['token'] = token;
  actionData[actionId] = data;

  setTimeout(() => {
    actionsSpan.classList.remove("flash");
  }, 500);


  if (ACTIONS == 0) {
    grid_done();
  }
}
function updateInventory (record) {
  const tableBody = document.getElementById('task-recipe-table').getElementsByTagName('tbody')[0];
  let row = tableBody.insertRow();
  let cellTransitions = row.insertCell(0);
  let yieldItemIcon = '&#x274C;';

  let yieldItem = record.yield;
  if (yieldItem.length > 1) {
    yieldItemIcon = nameToIcon(yieldItem);
  }

  cellTransitions.innerHTML = `${nameToIcon(record.held)} + ${nameToIcon(record.target)} = ${yieldItemIcon}`;
  row.scrollIntoView({ behavior: "smooth", block: "nearest" });
}
function updateItemTable(itemObj) {
  // Find table on dashboard and insert new row
  const tableBody = document.getElementById('task-reward-table').getElementsByTagName('tbody')[0];
  let row = tableBody.insertRow();
  let cellSprite = row.insertCell(0);
  let cellCalories = row.insertCell(1);

  // Find item sprite from game config and add to row
  cellSprite.innerHTML = nameToIcon(itemObj.item_name);
  cellCalories.innerHTML = 10 ** itemObj.item_level;

  // Sort the table
  let tbody = document.getElementById('task-reward-table').getElementsByTagName('tbody')[0];
  let rows = Array.from(tbody.getElementsByTagName('tr'))
  const rowData = rows.map(row => {
    const cells = row.getElementsByTagName('td');
    return {
      element: row,
      item: cells[0].innerText,
      calories: parseInt(cells[1].innerText, 10)
    };
  });
  rowData.sort((a, b) => b.calories - a.calories);
  while (tbody.firstChild) {
    tbody.removeChild(tbody.firstChild);
  }
  rowData.forEach(data => {
    tbody.appendChild(data.element);
  });
  row.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

// Combine items
function combineItem(heldItem, targetItem) {
  let yieldItem = '';

  let transition = transitions.find(record => record.held === heldItem && record.target === targetItem);
  if (transition) {
    yieldItem = transition.yield;

    if (yieldItem.length < 1) {
      getEl('task-info-hint').innerHTML = '';

    } else {
      // Update the current cell
      const playerCell = document.querySelector(
        `.grid-cell[data-x="${playerPosition.x}"][data-y="${playerPosition.y}"]`
      );

      playerCell.querySelector(".item-image").remove();
      currentlyCarrying = yieldItem;

      getEl("task-info-carrying").innerHTML = nameToIcon(currentlyCarrying);

      updatePlayerPosition();
      regenerateItems([heldItem, targetItem]);
    }

  } else {
    // check conditions
    if (COND == 'easy' && isSameShape([heldItem, targetItem])) {
      yieldItem = newObj(heldItem, targetItem);
    }

    if (COND == 'medium' && diffObjs1([heldItem, targetItem])) {
      yieldItem = newObj(heldItem, targetItem);
    }

    if (COND == 'hard-1' && modRule([heldItem, targetItem])) {
      yieldItem = newObj(heldItem, targetItem)
    }

    if (COND == 'hard-2' && modRule2([heldItem, targetItem])) {
      yieldItem = newObj(heldItem, targetItem)
    }

    if (COND == 'hard-3' && modRule3([heldItem, targetItem])) {
      yieldItem = newObj(heldItem, targetItem)
    }

    let record = {'held': heldItem, 'target': targetItem, 'yield': yieldItem}
    transitions.push(record);

    if (yieldItem.length > 0) {

      // create new item
      let itemList = items.map(item => item.item_name);
      if (itemList.indexOf(yieldItem) < 0) {
        items.push({
          'item_name': yieldItem,
          'x': playerPosition.x,
          'y': playerPosition.y,
          'item_level': getLevel(yieldItem),
          'item_icon': `../img/${yieldItem}.svg`
        });
      }

      // Update the current cell
      const playerCell = document.querySelector(
        `.grid-cell[data-x="${playerPosition.x}"][data-y="${playerPosition.y}"]`
      );

      playerCell.querySelector(".item-image").remove();
      currentlyCarrying = yieldItem;

      getEl("task-info-carrying").innerHTML = nameToIcon(currentlyCarrying);
      updatePlayerPosition();

      regenerateItems([heldItem, targetItem]);

    } else {
      getEl('task-info-hint').innerHTML = '';
    }

    updateInventory(record);
  }

  updateAction({'action': 'combine', 'held': heldItem, 'target': targetItem, 'yield': yieldItem, 'points': 0});

 }
function checkItemCount() {
  if (itemCount <= 0) {
    setTimeout(() => {
      grid_done();
    }, 1000);
  }
}
// Event listener for keyboard input
document.addEventListener("keydown", (event) => {
  if (event.key === " ") {
    handleSpacePress();
  } else if (event.key === "d" || event.key === "D") {
    handleDropPress();
  } else {
    handleKeyPress(event);
  }
});

// Initialize the grid
createGrid();
