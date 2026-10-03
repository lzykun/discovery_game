const isDev = true;
isDev? console.log(COND): null;

// Data
let start_time = new Date();
let start_task_time = null;
let task_end_time = null;
let instruction_start_time = null;
let messages_browse_start_time = null;
let messages_reflect_start_time = null;

let subjectData = {};
subjectData['start_time'] = formatDates(start_time, 'datetime');
instruction_start_time = start_time;

// Collect prolific id
function handle_prolific() {
  subjectData['prolific_id'] = getEl('prolific_id_text').value;
  instruction_start_time = new Date();
  hideAndShowNext('prolific_id', 'instruction', 'block');
}

// Instruction
getEl('instruct-action').innerHTML = MAX_ACTIONS;
let currentPage = 1;
const totalPages = 4;
function goToPage(n) {
  document.getElementById('instruct-page-' + currentPage).classList.remove('visible');
  currentPage = n;
  document.getElementById('instruct-page-' + currentPage).classList.add('visible');

  for (let i = 1; i <= totalPages; i++) {
    const dot = document.getElementById('dot-' + i);
    dot.classList.remove('active', 'done');
    if (i < currentPage)       
      dot.classList.add('done');
    else if (i === currentPage) dot.classList.add('active');
    }

  document.getElementById('progress-label').textContent = 'Page ' + currentPage + ' of ' + totalPages;
  document.getElementById('instruction').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function beginTask() {
  messages_browse_start_time = new Date();
  subjectData['instruction_duration'] = messages_browse_start_time - instruction_start_time;
  hideAndShowNext('instruction', 'messages', 'block');
}

// Comprehension check
let form = document.getElementById("comprehension-form");
let quizAnswers = [true, true, false, false]; 

function checkQuiz() {
  const userAnswers = quizAnswers.map((_, i) => {
    const name = "q" + (i + 1);
    const selected = form.querySelector(`input[name="${name}"]:checked`);
    if (!selected) return null; // unanswered
    return selected.value === "true"; // convert "true"/"false" → boolean
  });

  // check for missing answers
  if (userAnswers.includes(null)) {
    alert("Please answer all the true/false questions.");
    return;
  }

  // compare with ground truth
  const allCorrect = userAnswers.every((ans, i) => ans === quizAnswers[i]);

  // (optional) check recap is non-empty
  const recap = form.recap.value.trim();
  if (!recap) {
    alert("Please write a short summary in the recap box.");
    return;
  }

  if (allCorrect) {
    getEl('quiz-feedback').innerHTML = "🎉 All answers correct, let's Begin!";
    getEl('quiz-feedback').style.color = "green";
    hide('quiz-btn-div');
    setTimeout(() => {
      hideAndShowNext('quiz', 'task', 'block');
      getEl('quiz-feedback').innerHTML = "";
      showNext('quiz-btn-div');
    }, 2000);

  } else {
    getEl('quiz-feedback').innerHTML = "❌ Some answers are incorrect. Please review the instructions.";
    getEl('quiz-feedback').style.color = "red";
    hide('quiz-btn-div');
    setTimeout(() => {
      hideAndShowNext('quiz', 'instruction', 'block');
      hideAndShowNext('instruction-3', 'instruction-1', 'block');
      getEl('quiz-feedback').innerHTML = "";
      showNext('quiz-btn-div');
    }, 2500);
  }
}


// Main grid task functions see grid.js
function grid_done() {
  // Add a semi-transparent cover to the grid
  const cover = document.createElement("div");
  cover.id = "grid-cover";
  cover.innerHTML = "<h1>Game End</h1>";
  getEl('task-grid').appendChild(cover);

  task_end_time = new Date();
  subjectData['task_duration'] = task_end_time - start_task_time;

  // Wait for 2 seconds before transitioning to grid_done()
  setTimeout(() => {
    hide('task-info');
    getEl("task-content").style.marginTop = "40px";
    hide('task-grid');
    hide('task-strategy');
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

  // if (composerTextHow === "") {
  //   alert("Please type your message in the text area. You will be bonused for the quality of your message.");
  //   return;
  // }

  subjectData['messageHow'] = sanitizeText(composerTextHow);
  subjectData['messageRules'] = sanitizeText(composerTextRules);

  let message_done_time = new Date();
  subjectData['composition_duration'] = message_done_time - task_end_time;

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

  let clientData = {};
  clientData.subject = subjectData;
  clientData.subject.token = token;

  clientData.actions = actionData;
  clientData.events = eventData;
  clientData.notes = notesData;

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
  retObj['notes'] = JSON.stringify(data.notes);

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