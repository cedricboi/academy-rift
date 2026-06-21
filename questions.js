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
    choices: ["It is the easiest to use", "It gives you a wider view so you can find the specimen first", "It protects your eyes", "It makes the colors brighter"],
    answer: 1,
    topic: "Microscope",
    explain: "Low magnification shows a bigger area. This helps you locate and center your specimen before zooming in."
  },
  {
    q: "What is the purpose of the light source in a microscope?",
    choices: ["To heat the specimen", "To make the specimen bigger", "To shine light through the specimen so you can see it", "To stain the specimen different colors"],
    answer: 2,
    topic: "Microscope",
    explain: "The light passes through the specimen. Without light, you cannot see anything under the microscope."
  },
  {
    q: "What should you do before moving a microscope from one place to another?",
    choices: ["Take it apart into pieces", "Carry it by the eyepiece", "Hold it by the arm and support the base", "Wrap it in a towel"],
    answer: 2,
    topic: "Microscope",
    explain: "Always hold the arm and support the base with your hand. This keeps it safe and stops it from getting damaged."
  },
  {
    q: "Why is it important to keep the microscope clean?",
    choices: ["To make it look nice", "So the glass lenses stay clear and you can see properly", "To stop dust from entering the building", "To keep it working forever"],
    answer: 1,
    topic: "Microscope",
    explain: "If dust and dirt are on the lenses, they block light and make the image blurry. Clean lenses = clear picture."
  },
  {
    q: "What does the stage clip do?",
    choices: ["It makes the slide bigger", "It holds the slide in place so it does not slip", "It focuses the light", "It cleans the lens"],
    answer: 1,
    topic: "Microscope",
    explain: "The stage clip is a metal holder. It keeps your slide from moving around when you are looking at it."
  },
  {
    q: "What is a coverslip used for when making a slide?",
    choices: ["To hold the stage in place", "To cover the specimen and keep it flat and clean", "To magnify the image", "To turn on the light"],
    answer: 1,
    topic: "Microscope",
    explain: "A coverslip is a thin piece of glass. You put it on top of the specimen to protect it and flatten it for better viewing."
  },
  {
    q: "Why do scientists use a stain like methylene blue when preparing a slide?",
    choices: ["To kill the specimen", "To make the specimen bigger", "To color the cells so they are easier to see under the microscope", "To keep the specimen fresh"],
    answer: 2,
    topic: "Microscope",
    explain: "Stains add color to the structures inside cells. Colored structures are much easier to see than clear, colorless ones."
  },

  // ── Part 2: Parts of a Cell - What Each Part Does ────────────────────────
  {
    q: "What is a cell?",
    choices: ["A type of battery", "The smallest living unit that makes up all living things", "A part of a tissue", "A tiny piece of rock"],
    answer: 1,
    topic: "Cell Parts",
    explain: "A cell is the basic building block of all living things. All organisms are made of one or more cells."
  },
  {
    q: "Which part of the cell controls all the activities happening inside?",
    choices: ["The cell membrane", "The nucleus", "The cytoplasm", "The vacuole"],
    answer: 1,
    topic: "Cell Parts",
    explain: "The nucleus is like the control center. It is in charge of what the cell does and how it grows."
  },
  {
    q: "What is the cytoplasm?",
    choices: ["A type of cell wall", "The jelly-like substance inside the cell where most activities happen", "The colored part of a plant cell", "The outer layer of an animal cell"],
    answer: 1,
    topic: "Cell Parts",
    explain: "Cytoplasm is a watery gel that fills the cell. Chemical reactions happen here to keep the cell alive."
  },
  {
    q: "What does the cell membrane do?",
    choices: ["It makes the cell bigger", "It controls what goes in and out of the cell", "It produces energy for the cell", "It stores food"],
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
    choices: ["To move the cell around", "To store water, food, and waste", "To protect the nucleus", "To produce energy"],
    answer: 1,
    topic: "Cell Parts",
    explain: "Vacuoles are storage bags inside cells. Plant cells have one big vacuole. Animal cells have small ones or none."
  },
  {
    q: "Why do plant cells have chloroplasts but animal cells do not?",
    choices: ["Plants are bigger than animals", "Plants need to make their own food using sunlight, but animals eat food instead", "Animal cells have a cell wall instead", "Chloroplasts are too big for animal cells"],
    answer: 1,
    topic: "Cell Parts",
    explain: "Plants make their own food through photosynthesis. Animals eat other things for food, so they don't need chloroplasts."
  },
  {
    q: "What would happen to a cell if its nucleus was removed?",
    choices: ["It would grow bigger", "It would make more food", "It would eventually die because it has no control center", "It would become an animal cell"],
    answer: 2,
    topic: "Cell Parts",
    explain: "The nucleus controls everything the cell does. Without it, the cell cannot survive or function."
  },
  {
    q: "How are plant cells and animal cells similar?",
    choices: ["They both have a cell wall", "They both have chloroplasts", "They both have a cell membrane, nucleus, and cytoplasm", "They are exactly the same"],
    answer: 2,
    topic: "Cell Parts",
    explain: "Both plant and animal cells have these basic parts. But plant cells also have a cell wall and chloroplasts."
  },

  // ── Part 3: Plant Cells vs Animal Cells ─────────────────────────────────
  {
    q: "What is the main difference between a plant cell and an animal cell?",
    choices: ["Animal cells are always bigger", "Plant cells have a cell wall and chloroplasts", "Animal cells have more nuclei", "There is no difference at all"],
    answer: 1,
    topic: "Cell Types",
    explain: "Plant cells have a rigid cell wall and chloroplasts for making food. Animal cells have neither of these."
  },
  {
    q: "Why do plant cells have a fixed shape but animal cells are round?",
    choices: ["Plant cells are frozen", "The rigid cell wall gives plant cells a box-like shape", "Animal cells cannot hold their shape", "Plant cells are older"],
    answer: 1,
    topic: "Cell Types",
    explain: "The cell wall is tough and rigid. It prevents the plant cell from changing shape. Animal cells have only a flexible membrane."
  },
  {
    q: "Which of these is a plant cell?",
    choices: ["A red blood cell", "A nerve cell", "A leaf cell with a cell wall and chloroplasts", "A muscle cell"],
    answer: 2,
    topic: "Cell Types",
    explain: "Plant cells have a cell wall on the outside and chloroplasts inside. This combination is unique to plants."
  },
  {
    q: "Where do you find animal cells?",
    choices: ["Only in trees and flowers", "In animals like humans, dogs, and fish", "Only in water", "In rocks"],
    answer: 1,
    topic: "Cell Types",
    explain: "Animal cells are in all animals - including humans. They make up our skin, blood, muscles, and organs."
  },
  {
    q: "Do all plant cells have chloroplasts?",
    choices: ["Yes, every plant cell has them", "No, only leaves have chloroplasts", "No, roots and other parts without light do not have them", "Chloroplasts are in animal cells, not plants"],
    answer: 2,
    topic: "Cell Types",
    explain: "Chloroplasts need light to work. Root cells underground have no light, so they don't have chloroplasts."
  },
  {
    q: "What is the color of a chloroplast?",
    choices: ["Red", "Green because it contains a green substance called chlorophyll", "Yellow", "Clear"],
    answer: 1,
    topic: "Cell Types",
    explain: "Chlorophyll is a green pigment inside chloroplasts. This is what makes leaves green and captures sunlight."
  },
  {
    q: "Which type of cell can survive without a nucleus?",
    choices: ["Plant cells", "Animal cells", "Red blood cells (mature ones)", "All cells can"],
    answer: 2,
    topic: "Cell Types",
    explain: "Mature red blood cells push out their nucleus before entering the bloodstream. They can still deliver oxygen without it."
  },
  {
    q: "What shape are most animal cells?",
    choices: ["Square", "Box-shaped like plant cells", "Round or irregular", "Star-shaped"],
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
    choices: ["Yes, they are exactly the same", "No, animal cells either have very small vacuoles or none at all", "Animal cells have more vacuoles than plants", "Vacuoles are only in plant roots"],
    answer: 1,
    topic: "Cell Types",
    explain: "Plant cells have one big central vacuole. Animal cells have tiny ones or no vacuoles at all."
  },

  // ── Part 4: Cells and Living Organisms ─────────────────────────────────
  {
    q: "What is a unicellular organism?",
    choices: ["A very large organism", "A living thing made of only ONE cell", "An organism with many organs", "Something that is not alive"],
    answer: 1,
    topic: "Cells & Org.",
    explain: "Unicellular means 'one cell.' Examples are bacteria and amoeba. They are alive but have only one cell."
  },
  {
    q: "What is a multicellular organism?",
    choices: ["An organism made of many cells working together", "Something that is not alive", "A tiny organism you cannot see", "An old organism"],
    answer: 0,
    topic: "Cells & Org.",
    explain: "Multicellular organisms have many cells that work together. Humans, plants, and animals are all multicellular."
  },
  {
    q: "Which of these is a unicellular organism?",
    choices: ["A human", "A dog", "A bacterium", "A tree"],
    answer: 2,
    topic: "Cells & Org.",
    explain: "Bacteria are made of just one cell. Humans, dogs, and trees are made of millions of cells."
  },
  {
    q: "Can you see a unicellular organism with your naked eye?",
    choices: ["Yes, always", "No, most are too small and need a microscope to see", "Only on Mondays", "Size does not matter"],
    answer: 1,
    topic: "Cells & Org.",
    explain: "Most unicellular organisms are microscopic (very tiny). You need a microscope to see them."
  },
  {
    q: "What is a tissue in biology?",
    choices: ["A piece of paper", "A group of similar cells working together to do one job", "A type of cell", "Part of a microscope"],
    answer: 1,
    topic: "Cells & Org.",
    explain: "A tissue is made of many similar cells. For example, muscle tissue is made of many muscle cells working together."
  },
  {
    q: "What is an organ?",
    choices: ["A musical instrument", "A group of different tissues working together to do a job", "A single cell", "A type of microscope"],
    answer: 1,
    topic: "Cells & Org.",
    explain: "An organ is made of several types of tissue. Your heart is an organ made of muscle, nerve, and blood vessel tissue."
  },
  {
    q: "How does a multicellular organism like you work?",
    choices: ["Each cell does everything by itself", "Trillions of cells work together in an organized way", "Only one cell controls everything", "Cells do not really work together"],
    answer: 1,
    topic: "Cells & Org.",
    explain: "Your body has trillions of cells. Different cells specialize in different jobs and work together to keep you alive."
  },
  {
    q: "What does 'division of labor' mean in a multicellular organism?",
    choices: ["Cells fighting with each other", "Different cells doing different jobs to work together efficiently", "Cells being separated", "Only big cells working"],
    answer: 1,
    topic: "Cells & Org.",
    explain: "In your body, muscle cells contract, nerve cells send signals, and blood cells carry oxygen. Each type has its own job."
  },
  {
    q: "Why do multicellular organisms need many cells instead of just one giant cell?",
    choices: ["It looks nicer", "Small cells are more efficient - different cells can specialize in different jobs", "Giant cells are stronger but slower", "There is no good reason"],
    answer: 1,
    topic: "Cells & Org.",
    explain: "Having many specialized cells allows complex organisms to function. A single giant cell would not be as efficient."
  },
  {
    q: "How are you organized from smallest to largest?",
    choices: ["Cell → Organ → Tissue → Organism", "Cell → Tissue → Organ → Organism", "Tissue → Cell → Organ → Organism", "Organism → Organ → Tissue → Cell"],
    answer: 1,
    topic: "Cells & Org.",
    explain: "Start small: cells → group into tissues → tissues form organs → organs work together to make a complete organism."
  },

  // ── Part 5: How Cells Divide and Grow ───────────────────────────────────
  {
    q: "Why do cells divide?",
    choices: ["Because they are bored", "To grow larger and repair damage, and to make new organisms", "Because they are lazy", "Cells never divide"],
    answer: 1,
    topic: "Cell Division",
    explain: "Cell division allows organisms to grow, repair injuries, and reproduce. One cell becomes two identical cells."
  },
  {
    q: "What happens during cell division?",
    choices: ["The cell disappears", "The nucleus divides and the cell splits into two new cells", "The cell becomes bigger but stays as one", "Nothing important happens"],
    answer: 1,
    topic: "Cell Division",
    explain: "The nucleus divides first. Then the cytoplasm splits. You end up with two cells where you started with one."
  },
  {
    q: "How many new cells are created when one cell divides?",
    choices: ["One new cell", "Three new cells", "Two new identical cells", "Many random cells"],
    answer: 2,
    topic: "Cell Division",
    explain: "When a cell divides, it creates two daughter cells. Each one is identical to the original cell."
  },
  {
    q: "What does the nucleus do before a cell divides?",
    choices: ["It disappears", "It copies its DNA so each new cell gets a copy of the genetic information", "It shrinks", "It moves to the edge"],
    answer: 1,
    topic: "Cell Division",
    explain: "Before dividing, the nucleus makes a complete copy of all its DNA. This way, each new cell has the same instructions."
  },
  {
    q: "Why is cell division important for growth?",
    choices: ["It makes cells lazy", "It increases the number of cells so the organism gets bigger and stronger", "It stops growth", "It is not important"],
    answer: 1,
    topic: "Cell Division",
    explain: "You grew from a baby to your current size because your cells kept dividing. More cells = bigger body."
  },
  {
    q: "Can cells divide forever?",
    choices: ["Yes, infinitely", "No, most cells have a limit to how many times they can divide", "Only plant cells can divide many times", "It depends on the color"],
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
    choices: ["Making babies", "One cell dividing to create two identical cells", "Cells fighting", "Eating other cells"],
    answer: 1,
    topic: "Cell Division",
    explain: "When bacteria or amoebas divide, each parent cell becomes two identical offspring. No mating is needed."
  },
  {
    q: "Why is it dangerous for cancer cells to divide out of control?",
    choices: ["They make noise", "Too many unhealthy cells crowd out normal cells and damage organs", "Cancer cells are too slow", "It is not dangerous"],
    answer: 1,
    topic: "Cell Division",
    explain: "Cancer happens when cells divide when they should not. This creates tumors that damage healthy tissue."
  },
  {
    q: "How can you help your cells stay healthy and divide properly?",
    choices: ["Eat junk food", "Eat healthy food, exercise, sleep well, and avoid smoking and too much sun", "Sit in the dark all day", "Do nothing special"],
    answer: 1,
    topic: "Cell Division",
    explain: "A healthy lifestyle gives your cells what they need to function properly and divide correctly when needed."
  },

  // ── Part 6: Technology and Cells ────────────────────────────────────────
  {
    q: "Why was the microscope an important invention?",
    choices: ["To make glass prettier", "It let scientists see cells and discover the microscopic world for the first time", "To replace magnifying glasses", "It was not really important"],
    answer: 1,
    topic: "Cells & Tech",
    explain: "Before microscopes, people didn't know cells existed. Microscopes opened up an entire hidden world."
  },
  {
    q: "What can an electron microscope do that a light microscope cannot?",
    choices: ["Make things look prettier", "Show MUCH more detail because it magnifies way more - up to 500,000 times", "Work in sunlight", "Never break down"],
    answer: 1,
    topic: "Cells & Tech",
    explain: "Electron microscopes magnify up to 500,000×. Light microscopes magnify only about 1,500×. See way more detail!"
  },
  {
    q: "What was discovered when scientists looked at cells under microscopes?",
    choices: ["That cells are not real", "That all living things are made of cells", "That cells are made of rocks", "Nothing new"],
    answer: 1,
    topic: "Cells & Tech",
    explain: "Scientists discovered that all living things are made of cells. This is called 'Cell Theory' and it changed biology forever."
  },
  {
    q: "How do scientists use cell technology to study diseases?",
    choices: ["They ignore cells", "They look at cells under microscopes and grow cells in labs to understand disease", "They turn cells into robots", "They do nothing"],
    answer: 1,
    topic: "Cells & Tech",
    explain: "Studying cells helps doctors understand how diseases work and develop medicines and treatments."
  },
  {
    q: "What is a vaccine?",
    choices: ["A type of food", "A substance that teaches your immune cells to recognize and fight diseases", "A broken microscope", "A type of cell"],
    answer: 1,
    topic: "Cells & Tech",
    explain: "Vaccines help your body's cells learn to fight specific diseases BEFORE you catch them. This protects you."
  },
  {
    q: "How have microscopes improved over time?",
    choices: ["They have stayed exactly the same", "They have become more powerful and can see smaller and smaller things", "They got slower", "Modern ones are worse"],
    answer: 1,
    topic: "Cells & Tech",
    explain: "From simple lenses to electron microscopes, technology keeps improving. We keep discovering more about cells."
  },
  {
    q: "Why do doctors take biopsies (small samples of cells)?",
    choices: ["For fun", "To look at the cells under a microscope and check for diseases like cancer", "To give you snacks", "It has no purpose"],
    answer: 1,
    topic: "Cells & Tech",
    explain: "By examining cells from a biopsy, doctors can diagnose diseases and figure out the best treatment."
  },
  {
    q: "What is cloning?",
    choices: ["Making a cell dirty", "Creating a genetically identical copy of an organism from one cell", "Breaking things", "Planting seeds"],
    answer: 1,
    topic: "Cells & Tech",
    explain: "Scientists can take one cell and use its DNA to create an organism that is genetically identical to the original."
  },
  {
    q: "What is stem cell research?",
    choices: ["Studying plants only", "Studying special cells that can become different cell types and help repair bodies", "Making clothes", "Building robots"],
    answer: 1,
    topic: "Cells & Tech",
    explain: "Stem cells can grow into many different types of cells. Scientists hope to use them to treat injuries and diseases."
  },
  {
    q: "How is cell technology being used to make medicine?",
    choices: ["It is not used at all", "Scientists grow cells in labs to test medicines and develop treatments", "Cells are ignored", "Only plants are studied"],
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
