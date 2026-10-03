/** Game configs */
const MAX_ACTIONS = 40;
const gridSize = 15;
const conditions = ['easy', 'medium', 'hard'];
const COND = conditions[Math.floor(Math.random() * conditions.length)];

/** Global variables */
let items = [];
let transitions = [];
let ACTIONS = MAX_ACTIONS;
let POINTS = 0;
const MAXLEVEL = 6;


/** Player state */
let token = generateToken(8); // pseudo player id
let playerPosition = { x: 7, y: 7 };
getEl('task-info-actions').innerHTML = ACTIONS;
getEl('task-info-points').innerHTML = POINTS;


/** Item positions */
let baseItems = [];
let shapes = ["triangle", "circle", "square", "diamond"];
let textures = ["plain", "checkered", "stripes", "dots"];
shapes.forEach(s => {
  textures.forEach(t => {
    baseItems.push(`${s}_${t}_0`);
  });
});
let usedPositions = new Set();
for (let i = 0; i < baseItems.length; i++) {
  let x, y, position;
  do {
    x = Math.floor(Math.random() * gridSize);
    y = Math.floor(Math.random() * gridSize);
    position = `${x},${y}`;
  } while (usedPositions.has(position));

  usedPositions.add(position);
  item_name = baseItems[i];
  items.push({
    'item_name': item_name,
    'x': x,
    'y': y,
    'item_level': 0,
    'item_icon': `../img/${item_name}.svg`
  });
}
// console.log(items);


/** Helper functions */
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


/** Transitions functions */
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



// /** Transitions functions archive */
// function isDiffShapeAndPlain(item_list) {
//   return getShape(item_list[0]) !== getShape(item_list[1]) && getTexture(item_list[0]) === "plain";
// }
// function complexRule(item_list) {
//   return (
//     (getShape(item_list[0]) === 'circle' || getShape(item_list[0]) === 'square') &&
//     (getTexture(item_list[1]) === 'plain' || getTexture(item_list[1]) === 'dots') &&
//     getShape(item_list[1]) !== 'circle'
//   );
// }
// function diffObjs2(item_list) {
//   const shapeMatch = shapes.indexOf(getShape(item_list[0])) + shapes.indexOf(getShape(item_list[1])) === 3;
//   const textureMatch = true
//   return shapeMatch && textureMatch;
// }
// function capSet(item_list) {
//   const shapeMatch = shapes.indexOf(getShape(item_list[0])) + shapes.indexOf(getShape(item_list[1])) === 3;
//   const textureMatch = textures.indexOf(getTexture(item_list[0])) >= textures.indexOf(getTexture(item_list[1]));
//   return shapeMatch && textureMatch;
// }