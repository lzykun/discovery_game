const isDev = false;
isDev? console.log(COND): null;

// Data
let start_task_time = new Date();
let subjectData = {};

// Collect prolific id
function handle_prolific() {
  subjectData['prolific_id'] = getEl('prolific_id_text').value;
  hideAndShowNext('prolific_id', 'instruction', 'block');
}

// Instruction
getEl('instruct-action').innerHTML = MAX_ACTIONS;

// Main grid task functions see grid.js
function grid_done() {
  // Add a semi-transparent cover to the grid
  const cover = document.createElement("div");
  cover.id = "grid-cover";
  cover.innerHTML = "<h1>Game End</h1>";
  getEl('task-grid').appendChild(cover);

  // Wait for 2 seconds before transitioning to grid_done()
  setTimeout(() => {
    hide('task-info');
    getEl("task-content").style.marginTop = "40px";
    hide('task-grid');
    showNext('task-composer', 'block');
  }, 1000);
}

// Message composer
function handle_submit() {
  const composerTextHow = document.getElementById('composer-text-how').value;
  const composerTextRules = document.getElementById('composer-text-rules').value;

  if (composerTextHow === "" || composerTextRules === "") {
    alert("Please type your message in both text areas. You will be bonused for the quality of your message.");
    return;
  }

  subjectData['messageHow'] = composerTextHow;
  subjectData['messageRules'] = composerTextRules;
  hideAndShowNext('task', 'debrief', 'block');
}

// Bebrief
function enableDoneButton() {
  const doneButton = getEl('done-btn');
  if (isFilled('postquiz')) {
    doneButton.disabled = false;
  } else {
    doneButton.disabled = true;
  }
}
// Add event listeners to form inputs
const postquizForm = getEl('postquiz');
const inputs = postquizForm.elements;
for (let i = 0; i < inputs.length; i++) {
  if (inputs[i].type !== "submit") {
    inputs[i].addEventListener('input', enableDoneButton);
  }
}

function is_done(complete_code) {
  let inputs = getEl('postquiz').elements;
  Object.keys(inputs).forEach(id => subjectData[inputs[id].name] = inputs[id].value);

  // Get data
  subjectData['feedback'] = removeSpecial(subjectData['feedback']);
  subjectData['condition'] = COND;
  subjectData['total_points'] = POINTS;
  subjectData['allow_regeneration'] = allowRegeneration;

  const end_time = new Date();

  let clientData = {};
  clientData.subject = subjectData;
  clientData.subject.date = formatDates(end_time, 'date');
  clientData.subject.time = formatDates(end_time, 'time');
  clientData.subject.task_duration = end_time - start_task_time;
  clientData.subject.token = token;

  clientData.actions = actionData;
  clientData.events = eventData;


  // Show completion
  hide("debrief")
  showNext("completed")
  getEl('completion-code').append(document.createTextNode(complete_code));


  // Save data
  if (isDev) {
    console.log(clientData);
    // download(JSON.stringify(clientData), 'data.txt', '"text/csv"');

  } else {
    save_data(prep_data_for_server(clientData));
  }
}

function prep_data_for_server(data) {
  retObj = {};
  retObj['worker'] = data.subject.prolific_id;
  retObj['assignment'] = COND;
  retObj['total'] = data.subject.total_points;
  retObj['subject'] = JSON.stringify(data.subject);
  retObj['actions'] = JSON.stringify(data.actions);
  retObj['events'] = JSON.stringify(data.events);

  return retObj;
}
function save_data(data) {
  var xhr = new XMLHttpRequest();
  xhr.open('POST', '../php/save_data.php');
  xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.onload = function() {
    if(xhr.status == 200){
      console.log(xhr.responseText);
      // var response = JSON.parse(xhr.responseText);
      // console.log(response.success);
    }
  };
  // xhr.send('['+JSON.stringify(data)+']');
  xhr.send(JSON.stringify(data));
}