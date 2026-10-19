// ===== Academy Rift — Simplified Questions for Sec 1 Students =====
// 60 MCQ across 6 parts (easier version)
// Topics: Microscope basics, cell parts, plant vs animal cells, cells & organisms, cell division, cells & technology
// Answer key stays on server; clients only get questions + choices

export const QUESTIONS = [
  // ── Part 1: Microscope - Basic Parts and How to Use ──────────────────────
  {
    q: "Which two parts of a microscope help you see things that are very small?",
    choices: ["The stage and the slide", "The eyepiece and the objective lens", "The arm and the base", "The light and the mirror"],
    answer: 1,
    topic: "Microscope",
    explain: "The eyepiece is the lens you look through. The objective lens is the lens near the specimen. Together they make things look bigger."
  },
  {
    q: "What does the base of a microscope do?",
    choices: ["It makes the image bigger", "It holds the slide in place", "It keeps the microscope steady and stable", "It focuses the light on the specimen"],
    answer: 2,
    topic: "Microscope",
    explain: "The base is the flat bottom part. It stops the microscope from falling over when you put it on a table."
  },
  {
    q: "Which knob should you turn slowly to bring the specimen into focus?",
    choices: ["The light knob", "The fine adjustment knob", "The stage clip", "The mirror"],
    answer: 1,
    topic: "Microscope",
    explain: "The fine adjustment knob moves slowly and carefully. You use it to make the image clear and sharp after you see it first."
  },
  {
    q: "Why should you always start by looking at a specimen with the lowest magnification?",
    choices: ["It shows the most detail of the cells", "It gives you a wider view so you can find the specimen first", "It stops the specimen from drying out", "It makes the specimen look the biggest"],
    answer: 1,
    topic: "Microscope",
    explain: "Low magnification shows a bigger area. This helps you locate and centre your specimen before zooming in."
  },
  {
    q: "What is the purpose of the light source in a microscope?",
    choices: ["To focus the image of the specimen", "To make the specimen bigger", "To shine light through the specimen so you can see it", "To stain the specimen different colours"],
    answer: 2,
    topic: "Microscope",
    explain: "The light passes through the specimen. Without light, you cannot see anything under the microscope."
  },
  {
    q: "What should you do before moving a microscope from one place to another?",
    choices: ["Hold it by the stage with one hand", "Carry it by the eyepiece", "Hold it by the arm and support the base", "Carry it by the base only, with one hand"],
    answer: 2,
    topic: "Microscope",
    explain: "Always hold the arm and support the base with your hand. This keeps it safe and stops it from getting damaged."
  },
  {
    q: "Why is it important to keep the microscope clean?",
    choices: ["So the image becomes larger", "So the glass lenses stay clear and you can see properly", "So the light bulb does not overheat", "So the stage clips hold slides tightly"],
    answer: 1,
    topic: "Microscope",
    explain: "If dust and dirt are on the lenses, they block light and make the image blurry. Clean lenses = clear picture."
  },
  {
    q: "What does the stage clip do?",
    choices: ["It moves the slide up and down to focus", "It holds the slide in place so it does not slip", "It focuses the light", "It covers the specimen to keep it flat"],
    answer: 1,
    topic: "Microscope",
    explain: "The stage clip is a metal holder. It keeps your slide from moving around when you are looking at it."
  },
  {
    q: "What is a coverslip used for when making a slide?",
    choices: ["To hold the slide on the stage", "To cover the specimen and keep it flat and clean", "To magnify the image", "To add colour to the specimen"],
    answer: 1,
    topic: "Microscope",
    explain: "A coverslip is a thin piece of glass. You put it on top of the specimen to protect it and flatten it for better viewing."
  },
  {
    q: "Why do scientists use a stain like methylene blue when preparing a slide?",
    choices: ["To make the light brighter", "To make the specimen bigger", "To colour the cells so they are easier to see under the microscope", "To keep the specimen fresh"],
    answer: 2,
    topic: "Microscope",
    explain: "Stains add colour to the structures inside cells. Coloured structures are much easier to see than clear, colourless ones."
  },

  // ── Part 2: Parts of a Cell - What Each Part Does ────────────────────────
  {
    q: "What is a cell?",
    choices: ["A group of tissues that does one job", "The smallest living unit that makes up all living things", "A group of organs working together", "The smallest particle that makes up all matter"],
    answer: 1,
    topic: "Cell Parts",
    explain: "A cell is the basic building block of all living things. All organisms are made of one or more cells."
  },
  {
    q: "Which part of the cell controls all the activities happening inside?",
    choices: ["The cell membrane", "The nucleus", "The cytoplasm", "The vacuole"],
    answer: 1,
    topic: "Cell Parts",
    explain: "The nucleus is like the control centre. It is in charge of what the cell does and how it grows."
  },
  {
    q: "What is the cytoplasm?",
    choices: ["A type of cell wall", "The jelly-like substance inside the cell where most activities happen", "The coloured part of a plant cell", "The outer layer of an animal cell"],
    answer: 1,
    topic: "Cell Parts",
    explain: "Cytoplasm is a watery gel that fills the cell. Chemical reactions happen here to keep the cell alive."
  },
  {
    q: "What does the cell membrane do?",
    choices: ["It gives the cell a fixed shape", "It controls what goes in and out of the cell", "It produces energy for the cell", "It stores food"],
    answer: 1,
    topic: "Cell Parts",
    explain: "The cell membrane is a protective layer. It decides what substances can enter and leave the cell."
  },
  {
    q: "Which part is found only in plant cells and helps them stand up straight?",
    choices: ["The cell membrane", "The nucleus", "The cell wall", "The chloroplast"],
    answer: 2,
    topic: "Cell Parts",
    explain: "The cell wall is a tough, rigid layer outside the cell membrane. It gives plant cells their fixed shape and makes them stiff."
  },
  {
    q: "What is the function of a chloroplast in a plant cell?",
    choices: ["To store water", "To control cell activities", "To make food using sunlight", "To break down waste"],
    answer: 2,
    topic: "Cell Parts",
    explain: "Chloroplasts are like tiny food factories. They use sunlight to make food (glucose) for the plant."
  },
  {
    q: "What is the purpose of a vacuole in a cell?",
    choices: ["To control what enters the cell", "To store water, food, and waste", "To protect the nucleus", "To produce energy"],
    answer: 1,
    topic: "Cell Parts",
    explain: "Vacuoles are storage bags inside cells. Plant cells have one big vacuole. Animal cells have small ones or none."
  },
  {
    q: "Why do plant cells have chloroplasts but animal cells do not?",
    choices: ["Plants need chloroplasts to take in oxygen, but animals breathe with lungs", "Plants need to make their own food using sunlight, but animals eat food instead", "Plants need chloroplasts to stay upright, but animals have skeletons", "Plants need chloroplasts to store water, but animals drink water instead"],
    answer: 1,
    topic: "Cell Parts",
    explain: "Plants make their own food through photosynthesis. Animals eat other things for food, so they don't need chloroplasts."
  },
  {
    q: "What would happen to a cell if its nucleus was removed?",
    choices: ["It would divide faster because nothing stops it", "It would carry on as normal because the cytoplasm takes over", "It would eventually die because it has no control centre", "It would grow a new nucleus because the membrane makes one"],
    answer: 2,
    topic: "Cell Parts",
    explain: "The nucleus controls everything the cell does. Without it, the cell cannot survive or function."
  },
  {
    q: "How are plant cells and animal cells similar?",
    choices: ["They both have a cell wall", "They both have chloroplasts", "They both have a cell membrane, nucleus, and cytoplasm", "They both have one large vacuole"],
    answer: 2,
    topic: "Cell Parts",
    explain: "Both plant and animal cells have these basic parts. But plant cells also have a cell wall and chloroplasts."
  },

  // ── Part 3: Plant Cells vs Animal Cells ─────────────────────────────────
  {
    q: "What is the main difference between a plant cell and an animal cell?",
    choices: ["Animal cells have a cell wall and plant cells do not", "Plant cells have a cell wall and chloroplasts", "Plant cells have a cell membrane and animal cells do not", "Animal cells have a nucleus and plant cells do not"],
    answer: 1,
    topic: "Cell Types",
    explain: "Plant cells have a rigid cell wall and chloroplasts for making food. Animal cells have neither of these."
  },
  {
    q: "Why do plant cells have a fixed shape but animal cells are round?",
    choices: ["The cell membrane of plant cells is thick and stiff", "The rigid cell wall gives plant cells a box-like shape", "The chloroplasts hold plant cells in a box-like shape", "The cytoplasm of plant cells is solid, not jelly-like"],
    answer: 1,
    topic: "Cell Types",
    explain: "The cell wall is tough and rigid. It prevents the plant cell from changing shape. Animal cells have only a flexible membrane."
  },
  {
    q: "Which of these is a plant cell?",
    choices: ["A cheek cell with a nucleus and cytoplasm", "A red blood cell with no nucleus", "A leaf cell with a cell wall and chloroplasts", "A muscle cell with many small vacuoles"],
    answer: 2,
    topic: "Cell Types",
    explain: "Plant cells have a cell wall on the outside and chloroplasts inside. This combination is unique to plants."
  },
  {
    q: "Where do you find animal cells?",
    choices: ["In plants such as trees and grasses", "In animals like humans, dogs, and fish", "Only in animals that have a backbone", "Only in the human body"],
    answer: 1,
    topic: "Cell Types",
    explain: "Animal cells are in all animals - including humans. They make up our skin, blood, muscles, and organs."
  },
  {
    q: "Do all plant cells have chloroplasts?",
    choices: ["Yes, every plant cell has them", "No, only leaves have chloroplasts", "No, roots and other parts without light do not have them", "No, only cells in the stem have them"],
    answer: 2,
    topic: "Cell Types",
    explain: "Chloroplasts need light to work. Root cells underground have no light, so they don't have chloroplasts."
  },
  {
    q: "What is the colour of a chloroplast?",
    choices: ["Red because it contains a red substance called haemoglobin", "Green because it contains a green substance called chlorophyll", "Yellow because it stores starch", "Clear because it is filled with cell sap"],
    answer: 1,
    topic: "Cell Types",
    explain: "Chlorophyll is a green pigment inside chloroplasts. This is what makes leaves green and captures sunlight."
  },
  {
    q: "Which type of cell can survive without a nucleus?",
    choices: ["Plant cells", "Animal cells", "Red blood cells (mature ones)", "Root hair cells"],
    answer: 2,
    topic: "Cell Types",
    explain: "Mature red blood cells push out their nucleus before entering the bloodstream. They can still deliver oxygen without it."
  },
  {
    q: "What shape are most animal cells?",
    choices: ["Long and thin like a hair", "Box-shaped like plant cells", "Round or irregular", "Fixed in one shape by a cell wall"],
    answer: 2,
    topic: "Cell Types",
    explain: "Animal cells do not have a rigid cell wall, so they can be round or have different shapes. Plant cells are always box-like."
  },
  {
    q: "If a cell has both a cell wall and chloroplasts, what type of cell must it be?",
    choices: ["An animal cell", "A plant cell", "A bacterium", "A fungal cell"],
    answer: 1,
    topic: "Cell Types",
    explain: "Only plant cells have both a cell wall and chloroplasts. This combination is a clear sign of a plant cell."
  },
  {
    q: "Do animal cells have large vacuoles like plant cells?",
    choices: ["Yes, animal cells have one large central vacuole", "No, animal cells either have very small vacuoles or none at all", "Yes, but only in muscle cells", "No, vacuoles are found only in plant leaves"],
    answer: 1,
    topic: "Cell Types",
    explain: "Plant cells have one big central vacuole. Animal cells have tiny ones or no vacuoles at all."
  },

  // ── Part 4: Cells and Living Organisms ─────────────────────────────────
  {
    q: "What is a unicellular organism?",
    choices: ["A living thing that can only live in water", "A living thing made of only ONE cell", "A living thing made of one organ", "A living thing made of one tissue"],
    answer: 1,
    topic: "Cells & Org.",
    explain: "Unicellular means 'one cell.' Examples are bacteria and amoeba. They are alive but have only one cell."
  },
  {
    q: "What is a multicellular organism?",
    choices: ["An organism made of many cells working together", "An organism made of one very large cell", "An organism that can only be seen under a microscope", "An organism whose cells each live and work alone"],
    answer: 0,
    topic: "Cells & Org.",
    explain: "Multicellular organisms have many cells that work together. Humans, plants, and animals are all multicellular."
  },
  {
    q: "Which of these is a unicellular organism?",
    choices: ["A mushroom", "A tiny worm", "A bacterium", "A moss plant"],
    answer: 2,
    topic: "Cells & Org.",
    explain: "Bacteria are made of just one cell. Humans, dogs, and trees are made of millions of cells."
  },
  {
    q: "Can you see a unicellular organism with your naked eye?",
    choices: ["Yes, all of them are easy to see", "No, most are too small and need a microscope to see", "Only when they are dead and dried", "Only when they are in clean water"],
    answer: 1,
    topic: "Cells & Org.",
    explain: "Most unicellular organisms are microscopic (very tiny). You need a microscope to see them."
  },
  {
    q: "What is a tissue in biology?",
    choices: ["A group of different organs working together", "A group of similar cells working together to do one job", "A single cell that does one job", "A group of different tissues working together"],
    answer: 1,
    topic: "Cells & Org.",
    explain: "A tissue is made of many similar cells. For example, muscle tissue is made of many muscle cells working together."
  },
  {
    q: "What is an organ?",
    choices: ["A group of similar cells working together to do one job", "A group of different tissues working together to do a job", "A group of organ systems working together", "A single cell that does one important job"],
    answer: 1,
    topic: "Cells & Org.",
    explain: "An organ is made of several types of tissue. Your heart is an organ made of muscle, nerve, and blood vessel tissue."
  },
  {
    q: "How does a multicellular organism like you work?",
    choices: ["Each cell does everything by itself", "Trillions of cells work together in an organised way", "Only one cell controls everything", "All the cells are the same and do the same job"],
    answer: 1,
    topic: "Cells & Org.",
    explain: "Your body has trillions of cells. Different cells specialise in different jobs and work together to keep you alive."
  },
  {
    q: "What does 'division of labour' mean in a multicellular organism?",
    choices: ["Every cell doing all the jobs of the body", "Different cells doing different jobs to work together efficiently", "Cells dividing to make more cells", "Large cells doing the work for small cells"],
    answer: 1,
    topic: "Cells & Org.",
    explain: "In your body, muscle cells contract, nerve cells send signals, and blood cells carry oxygen. Each type has its own job."
  },
  {
    q: "Why do multicellular organisms need many cells instead of just one giant cell?",
    choices: ["A giant cell would be too heavy to move around", "Small cells are more efficient - different cells can specialise in different jobs", "Many small cells need less food than one giant cell", "Many small cells divide faster than one giant cell"],
    answer: 1,
    topic: "Cells & Org.",
    explain: "Having many specialised cells allows complex organisms to function. A single giant cell would not be as efficient."
  },
  {
    q: "How are you organised from smallest to largest?",
    choices: ["Cell → Organ → Tissue → Organism", "Cell → Tissue → Organ → Organism", "Tissue → Cell → Organ → Organism", "Organism → Organ → Tissue → Cell"],
    answer: 1,
    topic: "Cells & Org.",
    explain: "Start small: cells → group into tissues → tissues form organs → organs work together to make a complete organism."
  },

  // ── Part 5: How Cells Divide and Grow ───────────────────────────────────
  {
    q: "Why do cells divide?",
    choices: ["To make each cell bigger and stronger", "To grow larger and repair damage, and to make new organisms", "To get rid of waste from the cell", "To make food for the organism"],
    answer: 1,
    topic: "Cell Division",
    explain: "Cell division allows organisms to grow, repair injuries, and reproduce. One cell becomes two identical cells."
  },
  {
    q: "What happens during cell division?",
    choices: ["The cell splits into two, but only one keeps a nucleus", "The nucleus divides and the cell splits into two new cells", "The cell becomes bigger but stays as one", "Two cells join together to make one larger cell"],
    answer: 1,
    topic: "Cell Division",
    explain: "The nucleus divides first. Then the cytoplasm splits. You end up with two cells where you started with one."
  },
  {
    q: "How many new cells are created when one cell divides?",
    choices: ["One new cell", "Four new identical cells", "Two new identical cells", "Two new cells that are different"],
    answer: 2,
    topic: "Cell Division",
    explain: "When a cell divides, it creates two daughter cells. Each one is identical to the original cell."
  },
  {
    q: "What does the nucleus do before a cell divides?",
    choices: ["It splits its DNA in half so each new cell gets half", "It copies its DNA so each new cell gets a copy of the genetic information", "It makes a new cell wall around itself", "It grows to double the size of the cell"],
    answer: 1,
    topic: "Cell Division",
    explain: "Before dividing, the nucleus makes a complete copy of all its DNA. This way, each new cell has the same instructions."
  },
  {
    q: "Why is cell division important for growth?",
    choices: ["It makes each cell grow much bigger", "It increases the number of cells so the organism gets bigger and stronger", "It replaces all the old cells with fewer, larger cells", "It breaks the cells into smaller and smaller pieces"],
    answer: 1,
    topic: "Cell Division",
    explain: "You grew from a baby to your current size because your cells kept dividing. More cells = bigger body."
  },
  {
    q: "Can cells divide forever?",
    choices: ["Yes, infinitely", "No, most cells have a limit to how many times they can divide", "Only plant cells can divide many times", "Only animal cells can divide"],
    answer: 1,
    topic: "Cell Division",
    explain: "Cells have a 'Hayflick limit' - most can only divide about 50-70 times before they stop or die."
  },
  {
    q: "What type of damage can cell division help repair?",
    choices: ["Broken bones", "Cuts and wounds in your skin", "Burned areas", "All of the above"],
    answer: 3,
    topic: "Cell Division",
    explain: "Cell division helps your body repair many types of damage by creating new healthy cells to replace damaged ones."
  },
  {
    q: "What is asexual reproduction in single-celled organisms?",
    choices: ["Two cells joining together to make one new cell", "One cell dividing to create two identical cells", "One cell growing bigger without dividing", "One cell taking in food from other cells"],
    answer: 1,
    topic: "Cell Division",
    explain: "When bacteria or amoebas divide, each parent cell becomes two identical offspring. No mating is needed."
  },
  {
    q: "Why is it dangerous for cancer cells to divide out of control?",
    choices: ["Cancer cells spread from person to person like germs", "Too many unhealthy cells crowd out normal cells and damage organs", "Cancer cells stop all other cells from dividing", "Cancer cells divide too slowly to replace dead cells"],
    answer: 1,
    topic: "Cell Division",
    explain: "Cancer happens when cells divide when they should not. This creates tumours that damage healthy tissue."
  },
  {
    q: "How can you help your cells stay healthy and divide properly?",
    choices: ["Eat mostly sugary snacks for quick energy", "Eat healthy food, exercise, sleep well, and avoid smoking and too much sun", "Stay in the sun as long as possible", "Avoid exercise so the cells are not damaged"],
    answer: 1,
    topic: "Cell Division",
    explain: "A healthy lifestyle gives your cells what they need to function properly and divide correctly when needed."
  },

  // ── Part 6: Technology and Cells ────────────────────────────────────────
  {
    q: "Why was the microscope an important invention?",
    choices: ["It let scientists see atoms for the first time", "It let scientists see cells and discover the microscopic world for the first time", "It let doctors cure all diseases", "It let doctors see inside the body without cutting"],
    answer: 1,
    topic: "Cells & Tech",
    explain: "Before microscopes, people didn't know cells existed. Microscopes opened up an entire hidden world."
  },
  {
    q: "What can an electron microscope do that a light microscope cannot?",
    choices: ["Show living cells moving in colour", "Show much more detail because it can magnify up to 500,000 times", "Work using ordinary light and glass lenses", "Be carried easily and used anywhere"],
    answer: 1,
    topic: "Cells & Tech",
    explain: "Electron microscopes can magnify up to 500,000 times. Light microscopes magnify only about 1,500 times, so an electron microscope shows much more detail."
  },
  {
    q: "What was discovered when scientists looked at cells under microscopes?",
    choices: ["That only plants are made of cells", "That all living things are made of cells", "That all cells look exactly the same", "That non-living things are also made of cells"],
    answer: 1,
    topic: "Cells & Tech",
    explain: "Scientists discovered that all living things are made of cells. This is called 'Cell Theory' and it changed biology forever."
  },
  {
    q: "How do scientists use cell technology to study diseases?",
    choices: ["They study only the outside of the body", "They look at cells under microscopes and grow cells in labs to understand disease", "They study cells only after a person has died", "They look at cells with a hand lens"],
    answer: 1,
    topic: "Cells & Tech",
    explain: "Studying cells helps doctors understand how diseases work and develop medicines and treatments."
  },
  {
    q: "What is a vaccine?",
    choices: ["A medicine that kills bacteria already in your body", "A substance that teaches your immune cells to recognise and fight diseases", "A chemical that kills germs on surfaces", "A type of white blood cell given by injection"],
    answer: 1,
    topic: "Cells & Tech",
    explain: "Vaccines help your body's cells learn to fight specific diseases BEFORE you catch them. This protects you."
  },
  {
    q: "How have microscopes improved over time?",
    choices: ["They have stayed the same since the first one", "They have become more powerful and can see smaller and smaller things", "They have become weaker but cheaper", "They can now show only dead cells"],
    answer: 1,
    topic: "Cells & Tech",
    explain: "From simple lenses to electron microscopes, technology keeps improving. We keep discovering more about cells."
  },
  {
    q: "Why do doctors take biopsies (small samples of cells)?",
    choices: ["To stop the cells from dividing", "To look at the cells under a microscope and check for diseases like cancer", "To give the patient new healthy cells", "To make a vaccine from the patient's cells"],
    answer: 1,
    topic: "Cells & Tech",
    explain: "By examining cells from a biopsy, doctors can diagnose diseases and figure out the best treatment."
  },
  {
    q: "What is cloning?",
    choices: ["Joining cells from two parents to make a new organism", "Creating a genetically identical copy of an organism from one cell", "Changing the colour of an organism's cells", "Making an organism grow faster than normal"],
    answer: 1,
    topic: "Cells & Tech",
    explain: "Scientists can take one cell and use its DNA to create an organism that is genetically identical to the original."
  },
  {
    q: "What is stem cell research?",
    choices: ["Studying how plant stems carry water", "Studying special cells that can become different cell types and help repair bodies", "Studying cells that can become only one type of cell", "Studying why old cells stop working"],
    answer: 1,
    topic: "Cells & Tech",
    explain: "Stem cells can grow into many different types of cells. Scientists hope to use them to treat injuries and diseases."
  },
  {
    q: "How is cell technology being used to make medicine?",
    choices: ["Scientists turn cells directly into tablets", "Scientists grow cells in labs to test medicines and develop treatments", "Scientists give new medicines to patients without testing", "Scientists study only dead cells from animals"],
    answer: 1,
    topic: "Cells & Tech",
    explain: "Cell cultures in labs let scientists test thousands of drug compounds quickly before trying them on patients."
  }
];

// ===== HELPER FUNCTIONS =====

export function getQuestion(id) {
  if (id < 0 || id >= QUESTIONS.length) return null;
  return { id, ...QUESTIONS[id] };
}

export function getRandomQuestion() {
  const id = Math.floor(Math.random() * QUESTIONS.length);
  return getQuestion(id);
}

export function getQuestionsForClient() {
  return QUESTIONS.map((q, id) => ({
    id,
    q: q.q,
    choices: q.choices,
    topic: q.topic
  }));
}

export function checkAnswer(questionId, answerIndex) {
  if (questionId < 0 || questionId >= QUESTIONS.length) {
    return { correct: false, explanation: "Invalid question ID" };
  }

  const question = QUESTIONS[questionId];
  const isCorrect = answerIndex === question.answer;

  return {
    correct: isCorrect,
    explanation: question.explain,
    correctAnswer: question.answer
  };
}

export function getQuestionsByTopic(topic) {
  return QUESTIONS.reduce((acc, q, id) => {
    if (q.topic === topic) {
      acc.push({ id, q: q.q, choices: q.choices, topic: q.topic });
    }
    return acc;
  }, []);
}

export function getTopics() {
  return [...new Set(QUESTIONS.map(q => q.topic))];
}

// ── Bloom's taxonomy tag per question, index-aligned to QUESTIONS above ──────
// Six parts of 10 questions; each part is one selectable topic, and within each
// topic the questions span from lower- to higher-order thinking. If you reorder
// or insert questions above, update this list to match.
const BLOOM_SEQ = [
  // Part 1 — Microscope (Q1–10)
  "Remember","Understand","Understand","Understand","Understand","Apply","Understand","Remember","Understand","Understand",
  // Part 2 — Cell Parts (Q11–20)
  "Remember","Understand","Understand","Understand","Remember","Understand","Understand","Analyse","Analyse","Evaluate",
  // Part 3 — Cell Types (Q21–30)
  "Remember","Understand","Understand","Understand","Analyse","Understand","Analyse","Evaluate","Apply","Apply",
  // Part 4 — Cells & Organisms (Q31–40)
  "Understand","Understand","Remember","Remember","Understand","Understand","Apply","Apply","Understand","Analyse",
  // Part 5 — Cell Division (Q41–50)
  "Remember","Understand","Understand","Understand","Analyse","Understand","Apply","Understand","Analyse","Evaluate",
  // Part 6 — Cells & Technology (Q51–60)
  "Understand","Remember","Understand","Understand","Apply","Understand","Apply","Analyse","Understand","Understand",
];

// ── Hints, index-aligned to QUESTIONS above ──────────────────────────────────
// A player can ask for one on their own question, at a cost (see server.js).
// Each hint points towards the idea without naming the answer.
const HINTS = [
  "Light passes through two sets of lenses before it reaches your eye.",
  "Think about which part sits flat on the table.",
  "One focusing knob moves the stage a lot. The other moves it only a little.",
  "At low magnification you can see a bigger area of the slide.",
  "You can only see a specimen when light passes through it.",
  "Use both hands and hold the strongest parts of the microscope.",
  "Dirt and smudges on glass get in the way of what you see.",
  "Its name tells you where it is and what it grips.",
  "It is a thin square of glass placed on top of the specimen.",
  "Most cells are almost see-through.",
  "Every living thing is built from these units.",
  "This part holds the cell's genetic information (DNA).",
  "It fills the space between the cell membrane and the nucleus.",
  "It is a thin layer around the cell that lets only some substances through.",
  "This part is stiff and is made of cellulose.",
  "Photosynthesis happens in this part.",
  "Think of it as a storage space inside the cell.",
  "Think about how plants and animals each get their food.",
  "The nucleus controls everything the cell does.",
  "Look for the option that names parts found in both kinds of cell.",
  "Two parts are found in plant cells only.",
  "One plant cell part is stiff and surrounds the cell membrane.",
  "Plant cells have a cell wall and chloroplasts.",
  "Animal cells make up the bodies of animals.",
  "Chloroplasts are only needed in the parts of a plant that get sunlight.",
  "Chloroplasts contain a pigment that absorbs light for photosynthesis.",
  "This cell carries oxygen and has no room to spare for a nucleus.",
  "Animal cells have no cell wall to give them a fixed shape.",
  "Only one kind of cell in this list has both of these parts.",
  "Plant cells have one large vacuole in the middle.",
  "“Uni” means one.",
  "“Multi” means many.",
  "Which of these is made of just one cell?",
  "Most single cells are smaller than 0.1 mm across.",
  "A tissue is one level above a cell.",
  "The heart and the stomach are examples.",
  "Your body has many kinds of cells that work as a team.",
  "Labour means work.",
  "Different jobs need different kinds of cells.",
  "Start with the smallest unit of life.",
  "Think about how a cut on your skin heals.",
  "Cell division starts in the nucleus.",
  "One cell splits into two.",
  "Each new cell needs its own set of instructions.",
  "More cells make a bigger organism.",
  "Most body cells can only divide a certain number of times.",
  "Cell division replaces damaged cells anywhere in the body.",
  "Only one parent cell is involved.",
  "Cancer cells keep dividing when the body does not need new cells.",
  "Think about everyday habits that keep the whole body healthy.",
  "Cells are too small to see with the naked eye.",
  "It uses beams of electrons instead of light.",
  "This idea is part of the cell theory.",
  "Scientists study cells under microscopes and also grow them in the lab.",
  "A vaccine prepares the body before a real infection.",
  "Compare an early microscope with an electron microscope.",
  "The sample is looked at under a microscope.",
  "A clone has exactly the same genetic information as the original.",
  "Stem cells are not specialised yet.",
  "Cells grown in a lab can be used to test new medicines safely."
];

// Map each question's short topic label to a stable topic id (matches topics.js).
const TOPIC_ID_BY_LABEL = {
  "Microscope": "micro", "Cell Parts": "parts", "Cell Types": "models",
  "Cells & Org.": "org", "Cell Division": "labour", "Cells & Tech": "tech",
};

QUESTIONS.forEach((q, i) => {
  q.bloom = BLOOM_SEQ[i] || "Understand";
  q.topicId = TOPIC_ID_BY_LABEL[q.topic] || "mixed";
  q.hint = HINTS[i] || "";
});

// Misconception notes for each wrong option (shown when a question comes back) and the "why" reasons that unlock
// the Ultimate, kept in questions.notes.json beside this file.
import { readFileSync } from "fs";
try {
  const extra = JSON.parse(readFileSync(new URL("./questions.notes.json", import.meta.url), "utf8"));
  QUESTIONS.forEach((q, i) => { const x = extra[i]; if (!x) return; q.notes = x.notes || {}; q.why = x.why || null; if (!q.explain) q.explain = x.explain || ""; });
} catch (e) { console.warn("[questions] no notes:", e.message); }
