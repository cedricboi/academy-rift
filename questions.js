// ===== Academy Rift — question bank (SERVER ONLY) =====
// 60 MCQ across 6 parts — Cells (microscope, cell parts, models, organisation, division of labour, technology)
// `answer` is the 0-based correct choice index.
// Answers never leave the server; clients only receive {q, choices, topic, difficulty, seconds, startedAt}.
export const QUESTIONS = [

  // ── Part 1: Microscope Components, Safety, and Correct Usage ──────────────
  {
    q: "Which two parts of a light microscope work together to produce a magnified image of a specimen?",
    choices: ["Stage and stage clip", "Arm and base", "Eyepiece and objective lenses", "Coarse adjustment knob and fine adjustment knob"],
    answer: 2, topic: "Microscope", explain: "The eyepiece lens (10×) and the objective lens together create the final magnified image."
  },
  {
    q: "What is the structural purpose of the arm and the base of a light microscope?",
    choices: ["To magnify the specimen to different extents", "To provide support and a means to carry the microscope securely", "To focus light directly through the stage opening", "To adjust the resolution of the image under high power"],
    answer: 1, topic: "Microscope", explain: "The arm supports the body tube and is held when carrying; the base provides stability on a flat surface."
  },
  {
    q: "What is the function of the condenser in a light microscope?",
    choices: ["To further magnify the image produced by the objective lens", "To adjust the amount of light that passes through the specimen", "To securely hold the slide in position on the stage", "To shift between low and high power magnification options"],
    answer: 1, topic: "Microscope", explain: "The condenser focuses and concentrates light from the source onto the specimen to improve brightness and clarity."
  },
  {
    q: "Which knob should be adjusted first to bring a specimen into general focus under low magnification?",
    choices: ["Fine adjustment knob", "Coarse adjustment knob", "Condenser adjustment knob", "Stage clip adjustment lever"],
    answer: 1, topic: "Microscope", explain: "The coarse knob moves the stage rapidly to get an approximate focus before the fine knob sharpens the image."
  },
  {
    q: "Why should you always begin observing a specimen with the lowest magnification objective lens?",
    choices: ["It provides the highest resolution details of small cell structures.", "It provides a wider field of view to locate the specimen easily before focusing.", "It allows less light to pass through, protecting the user's eyes.", "It prevents the slide from cracking against the lens automatically."],
    answer: 1, topic: "Microscope", explain: "Low power gives a wide field of view, making it easier to find and centre the specimen before switching to higher magnification."
  },
  {
    q: "Why must a specimen be positioned at the exact centre of the stage before changing to a higher magnification objective lens?",
    choices: ["To prevent the slide from slipping off the stage.", "To ensure the target area remains within the smaller field of view.", "To allow the condenser to shut down excess light.", "To minimize the need to use the fine adjustment knob later."],
    answer: 1, topic: "Microscope", explain: "Higher magnification narrows the field of view dramatically; a specimen off-centre will disappear from view entirely."
  },
  {
    q: "What is the primary reason for lowering a coverslip slowly at an angle using a mounting needle during slide preparation?",
    choices: ["To ensure the specimen is thoroughly flattened on the tile.", "To prevent air bubbles from being trapped between the coverslip and slide.", "To chemically activate the staining properties of methylene blue.", "To safely minimize contact with hazardous biological materials."],
    answer: 1, topic: "Microscope", explain: "Lowering the coverslip at an angle lets air escape from one side, preventing bubbles that would obscure the image."
  },
  {
    q: "What is the purpose of using filter paper at the edge of a completed coverslip setup?",
    choices: ["To add extra water to keep the plant cell alive.", "To soak up any excess staining solution or liquid around the coverslip.", "To keep dust particles from settling on top of the slide.", "To protect the microscope stage from being scratched by glass."],
    answer: 1, topic: "Microscope", explain: "Filter paper is absorbent and draws surplus stain away from the coverslip edge, keeping the stage clean."
  },
  {
    q: "Which safety and hygiene step must be performed before obtaining human cheek cells?",
    choices: ["Wash the microscope slide with a dilute iodine solution.", "Wear protective gloves and use the blunt end of a clean toothpick.", "Heat the mounting needle using the microscope's light source.", "Sterilize the inner cheek surface with methylene blue beforehand."],
    answer: 1, topic: "Microscope", explain: "Gloves and a clean blunt toothpick prevent cross-contamination and protect both the student and the specimen."
  },
  {
    q: "What is the purpose of utilizing a white tile during the preparation of an onion skin specimen?",
    choices: ["To provide a clean, hard surface to cut the onion skin safely with a scalpel.", "To reflect ambient light through the microscope's condenser.", "To absorb excess water before transferring the skin to the glass slide.", "To check if the single layer of onion skin is folded or unfolded."],
    answer: 0, topic: "Microscope", explain: "A white tile provides a safe, clean, non-slip cutting surface that is easy to clean after handling the specimen."
  },

  // ── Part 2: Functions of the Parts of a Typical Cell ─────────────────────
  {
    q: "Which jelly-like substance fills up a cell and acts as the site where most chemical reactions take place?",
    choices: ["Nucleus", "Vacuole", "Cytoplasm", "Cell membrane"],
    answer: 2, topic: "Cell Parts", explain: "Cytoplasm is the gel-like fluid that fills the cell and is the medium for metabolic reactions such as glycolysis."
  },
  {
    q: "What is the primary function of the nucleus in a typical cell?",
    choices: ["It serves as the food factory where photosynthesis happens.", "It acts as the centre that controls all activities occurring within the cell.", "It controls the movement of substances into and out of the cell.", "It stores massive quantities of liquids, food, and waste materials."],
    answer: 1, topic: "Cell Parts", explain: "The nucleus contains DNA and directs all cellular activities including growth, metabolism, and reproduction."
  },
  {
    q: "What is the role of deoxyribonucleic acid (DNA) found inside the cell nucleus?",
    choices: ["It provides a rigid outer shape to protect plant structures from bursting.", "It is the hereditary or genetic material passed down from parents to offspring.", "It acts as a specialized chemical barrier that lets food enter the cytoplasm.", "It captures sunlight directly to initiate cellular food production."],
    answer: 1, topic: "Cell Parts", explain: "DNA carries the genetic code (genes) that is inherited from parents and controls all inherited characteristics."
  },
  {
    q: "What will happen to a typical plant or animal cell if its nucleus is completely removed?",
    choices: ["The cell will develop multiple cell walls to protect itself.", "The cell will grow larger and form numerous small vacuoles.", "The cell will eventually die.", "The cell will immediately turn into a unicellular organism."],
    answer: 2, topic: "Cell Parts", explain: "Without the nucleus to direct cellular activities and supply genetic information, the cell cannot sustain itself and dies."
  },
  {
    q: "Which cell structure is a thin outer layer that controls the movement of substances into and out of a cell?",
    choices: ["Cell wall", "Cell membrane", "Cytoplasm", "Chloroplast"],
    answer: 1, topic: "Cell Parts", explain: "The cell membrane is a selectively permeable phospholipid bilayer that controls what enters and exits the cell."
  },
  {
    q: "Where is the cell membrane situated in a typical plant cell?",
    choices: ["It forms the outermost rigid layer surrounding the cell wall.", "It is located inside the nucleus to guard the DNA.", "It forms a thin protective layer directly underneath the cell wall.", "It is embedded directly within the chloroplast's food matrix."],
    answer: 2, topic: "Cell Parts", explain: "In a plant cell the outermost layer is the rigid cell wall; the cell membrane lies just inside it, surrounding the cytoplasm."
  },
  {
    q: "Which characteristics accurately describe a plant cell wall?",
    choices: ["Fluid, thin, and responsible for controlling all chemical reactions.", "Small, numerous, and responsible for storing toxic cellular wastes.", "Tough, rigid, and responsible for giving the cell a regular shape.", "Semi-permeable, spherical, and localized inside the cytoplasm."],
    answer: 2, topic: "Cell Parts", explain: "The plant cell wall is made of cellulose, making it tough and rigid, which gives plant cells their fixed, box-like shape."
  },
  {
    q: "Why is the chloroplast described as the \"food factory\" in a plant cell?",
    choices: ["It breaks down waste materials to release simple nutrients.", "It absorbs minerals from the roots and stores them safely.", "It allows the chemical process of photosynthesis to take place.", "It pumps sugars out across the cellular membrane."],
    answer: 2, topic: "Cell Parts", explain: "Chloroplasts contain chlorophyll and carry out photosynthesis, converting light energy into glucose for the plant."
  },
  {
    q: "What is the main function of a vacuole within a typical cell?",
    choices: ["It controls the hereditary properties passed to the next generation.", "It acts as a structural space that stores liquids, food, and waste materials.", "It maintains a regular outer shape so that the plant stands upright.", "It coordinates signal transmissions to neighboring cells."],
    answer: 1, topic: "Cell Parts", explain: "Vacuoles store water, dissolved salts, sugars, and waste; the large central vacuole also helps maintain turgor pressure."
  },
  {
    q: "Why can the structural function of a chloroplast not be assumed by a vacuole?",
    choices: ["Vacuoles do not contain the genetic information needed to make cell walls.", "Different cell structures have specific functions that cannot be replaced by others.", "Vacuoles are always located outside the cell membrane boundary.", "Chloroplasts are the only structures that store liquids and waste items."],
    answer: 1, topic: "Cell Parts", explain: "Each organelle has a unique structure adapted for a specific job; photosynthesis requires chlorophyll found only in chloroplasts."
  },

  // ── Part 3: Cell Models and Inferences ───────────────────────────────────
  {
    q: "Why do scientists and teachers use standard cell models if real cells feature many different shapes and sizes?",
    choices: ["Models help us understand common characteristics and predict general behaviors.", "Models are identical to every single cell type found in nature.", "Models prove that all biological structures are exactly the same size.", "Models replace the need to use electron microscopes in research."],
    answer: 0, topic: "Cell Models", explain: "Typical cell models highlight shared features (nucleus, membrane, cytoplasm), enabling general predictions about cell behaviour."
  },
  {
    q: "Which of the following correctly pairs a typical cell model with its vacuole characteristics?",
    choices: ["Typical plant cell → Small and numerous vacuoles", "Typical animal cell → One or two large central vacuoles", "Typical plant cell → Large and few vacuoles", "Typical animal cell → Complete absence of vacuoles"],
    answer: 2, topic: "Cell Models", explain: "Plant cells typically have one large central vacuole that can occupy most of the cell's volume."
  },
  {
    q: "Why do plant root hair cells completely lack chloroplasts?",
    choices: ["They have extra tough cell walls that block out chlorophyll.", "They are located underground where there is no light for photosynthesis.", "Their vacuoles take over the job of producing food instead.", "They are animal cells that have been misclassified as plant tissue."],
    answer: 1, topic: "Cell Models", explain: "Chloroplasts are only present where photosynthesis can occur; root cells are underground and receive no light."
  },
  {
    q: "What structural characteristic explains why the centre of human red blood cells appears pale under a microscope?",
    choices: ["They possess abnormally large vacuoles in the middle.", "They contain massive amounts of green chloroplasts.", "They do not have a cell wall to maintain their circular configuration.", "They lack a nucleus in their mature form."],
    answer: 3, topic: "Cell Models", explain: "Mature red blood cells expel their nucleus before entering the bloodstream, creating a pale bi-concave centre that carries more haemoglobin."
  },
  {
    q: "An unknown cell exhibits a cell wall, a cell membrane, and a nucleus. What can you infer about this cell?",
    choices: ["It is definitely an animal cell.", "It is a plant cell, even if chloroplasts are not visible.", "It is a unicellular bacterium that lacks a cytoplasm.", "It is an artificial organ created via 3D printing."],
    answer: 1, topic: "Cell Models", explain: "A cell wall combined with a nucleus identifies this as a plant cell; not all plant cells have visible chloroplasts."
  },
  {
    q: "A unicellular organism has chloroplasts to make food, but can also swim to absorb food particles. How should this organism be evaluated against standard cell models?",
    choices: ["It fits the typical animal cell model perfectly due to its motion.", "It shows characteristics of both typical plant and animal cell models.", "It cannot be considered a real living thing because it violates cell models.", "It proves that plant cell walls do not allow light to pass through."],
    answer: 1, topic: "Cell Models", explain: "Organisms like Euglena photosynthesise (plant-like) and can actively move to absorb nutrients (animal-like), fitting both models."
  },
  {
    q: "What is a primary limitation of utilizing typical cell models in science?",
    choices: ["They cannot show the presence of a nucleus or cell membrane.", "They simplify cell shapes and may not represent the vast diversity of real cells.", "They are too complex to be interpreted by junior biology students.", "They do not allow comparisons with newly discovered organisms."],
    answer: 1, topic: "Cell Models", explain: "Typical models represent 'average' cells; real cells come in hundreds of specialised shapes and sizes that models cannot capture."
  },
  {
    q: "How would models of typical plant and animal cells assist scientists who discover unknown cells on another planet?",
    choices: ["They can be used to compare structures and infer if the unknown cells share similarities with Earth plants or animals.", "They can automatically turn the unknown alien cell into an identical copy of a human cell.", "They eliminate the need to view the alien cells under light or electron microscopes.", "They determine the exact age and evolutionary timeline of the alien planet."],
    answer: 0, topic: "Cell Models", explain: "Comparing unknown structures to Earth's cell models allows scientists to infer possible functions and evolutionary relationships."
  },
  {
    q: "In a school analogy for a plant cell, which school features correspond to the cell wall and cell membrane respectively?",
    choices: ["The classrooms and the principal's office", "The outer fence and the security guard at the gate", "The storage rooms and the student canteen", "The sports hall and the school textbooks"],
    answer: 1, topic: "Cell Models", explain: "The outer fence = rigid cell wall (structure/protection); the security guard = cell membrane (controls what enters/exits)."
  },
  {
    q: "In a school analogy for a plant cell, why does the student canteen represent the chloroplasts?",
    choices: ["It regulates the movement of people into and out of the main premises.", "It is the designated space where food is made.", "It acts as the central hub where major administrative decisions are made.", "It stores old furniture and unwanted waste materials."],
    answer: 1, topic: "Cell Models", explain: "Just as a canteen is where food is prepared, chloroplasts produce glucose through photosynthesis to feed the cell."
  },

  // ── Part 4: Cellular Organisation in Multicellular Organisms ─────────────
  {
    q: "What is the fundamental difference between a unicellular organism and a multicellular organism?",
    choices: ["Unicellular organisms are always visible to the naked eye.", "Multicellular organisms are composed of many cells working together.", "Unicellular organisms lack cell membranes and cytoplasm entirely.", "Multicellular organisms consist of only one type of identical cell."],
    answer: 1, topic: "Cellular Org.", explain: "A unicellular organism performs all life functions in one cell; a multicellular organism uses many cooperating cells."
  },
  {
    q: "Why is it incorrect to assume that an organism is unicellular or multicellular based on its physical size?",
    choices: ["Some small organisms can still be multicellular because they contain more than one cell.", "All massive organisms are actually made up of a single giant cell.", "Large cells always lack nuclei and vacuoles.", "The size of an organism changes depending on the light microscope used."],
    answer: 0, topic: "Cellular Org.", explain: "Size alone does not determine cell number — a tiny nematode worm has around 1,000 cells yet is microscopically small."
  },
  {
    q: "Which of the following lists contains only unicellular organisms?",
    choices: ["Mushroom, worm, and cat", "Paramecium, diatom, and bacterium", "Onion, human, and orchid plant", "Red blood cell, nerve cell, and cheek cell"],
    answer: 1, topic: "Cellular Org.", explain: "Paramecium, diatoms, and bacteria are all single-celled; the other options include multicellular organisms or individual cells within organisms."
  },
  {
    q: "What is the correct sequence of cellular organization from the simplest building block to the most complex level?",
    choices: ["Tissue → Cell → Organ → System → Organism", "Cell → Organ → Tissue → System → Organism", "Cell → Tissue → Organ → System → Organism", "Organism → System → Organ → Tissue → Cell"],
    answer: 2, topic: "Cellular Org.", explain: "The biological hierarchy from simplest to most complex is: cell → tissue → organ → organ system → organism."
  },
  {
    q: "Which statement best describes a biological tissue?",
    choices: ["A group of completely different organisms living in the same habitat.", "A collection of cells of the same type working together to perform a specific function.", "An administrative office that controls all metabolic actions in animals.", "The fluid structure that fills up the inner vacuole spaces."],
    answer: 1, topic: "Cellular Org.", explain: "A tissue is a group of similar cells coordinating to do the same job, e.g. muscle tissue contracts, epithelial tissue covers surfaces."
  },
  {
    q: "Which level of cellular organization is represented by a plant root or a human stomach?",
    choices: ["Tissue", "Organ", "System", "Organism"],
    answer: 1, topic: "Cellular Org.", explain: "A root and a stomach are both organs — structures made of several tissues working together to perform a particular function."
  },
  {
    q: "A plant transport system consists of different parts like the root and the stem working together. What level of organization does this represent?",
    choices: ["Cell", "Tissue", "System", "Organism"],
    answer: 2, topic: "Cellular Org.", explain: "An organ system is a group of organs working together; the plant transport system (roots, stem, leaves) is a classic example."
  },
  {
    q: "In the organizational hierarchy of a tree, what level of structure does the root tissue layer form when combined with other tissues?",
    choices: ["An individual cell unit", "An organ", "A complete multicellular organism", "A microscopic unicellular structure"],
    answer: 1, topic: "Cellular Org.", explain: "When different tissues (vascular, epidermis, cortex) combine and cooperate in the root, they form an organ."
  },
  {
    q: "Which statement correctly addresses an error regarding cellular organization?",
    choices: ["Tissues are formed when different organ systems fuse together.", "Organs are formed when different tissues work together to perform specific functions.", "Cells are formed when multiple complex organs are grouped into systems.", "Organisms are formed when individual cell walls dissolve into tissues."],
    answer: 1, topic: "Cellular Org.", explain: "Organs are formed by multiple different tissues (e.g. the stomach contains muscle, epithelial, and connective tissues)."
  },
  {
    q: "The human mouth, stomach, small intestine, and large intestine work together to digest food. What does this entire collective group represent?",
    choices: ["An organ tissue matrix", "An organ system", "An individual cell model", "A unicellular organism colony"],
    answer: 1, topic: "Cellular Org.", explain: "These four organs collectively form the digestive system — an organ system that coordinates to break down and absorb food."
  },

  // ── Part 5: Significance of the Division of Labour ────────────────────────
  {
    q: "What does the term \"division of labour\" mean in relation to living things?",
    choices: ["Cells dividing rapidly to increase the overall size of an animal.", "Different parts performing various functions in a coordinated way to ensure efficiency.", "Eliminating all vacuoles so that a cell can perform photosynthesis faster.", "Forcing every cell in an organism to perform identical biochemical tasks."],
    answer: 1, topic: "Division of Labour", explain: "Division of labour means different specialised parts (cells, tissues, organs) each perform specific tasks, making the organism more efficient."
  },
  {
    q: "Why is the division of labour significant for a multicellular organism's survival?",
    choices: ["It allows complex processes to occur effectively and efficiently.", "It ensures that all cells look exactly like the typical animal cell model.", "It allows single cells to grow to the size of large organs.", "It prevents genetic material from being passed down to the next generation."],
    answer: 0, topic: "Division of Labour", explain: "Specialisation allows each part to perform its function far more effectively than if every part tried to do everything."
  },
  {
    q: "How do muscle tissue and blood tissue work together in the human small intestine to show division of labour?",
    choices: ["They both build rigid cell walls to change the shape of the organ.", "Muscle tissue pushes food along while blood tissue carries nutrients away.", "Muscle tissue performs photosynthesis while blood tissue acts as a storage vacuole.", "They alternate absorbing water and multiplying DNA material."],
    answer: 1, topic: "Division of Labour", explain: "Muscle tissue contracts (peristalsis) to move food along, while blood vessels absorb and transport digested nutrients — two different roles."
  },
  {
    q: "How does a single root hair cell show the division of labour at the cellular level?",
    choices: ["Its nucleus takes over the job of absorbing minerals while the cytoplasm disappears.", "Its cell membrane controls the movement of substances into the cell while its cell wall prevents it from bursting.", "Its chloroplasts make food while its giant central vacuole pumps blood.", "It detaches its cell wall to allow water to flood directly into the stem."],
    answer: 1, topic: "Division of Labour", explain: "Within one cell, the membrane handles selective transport, the wall provides structural support — two structures, two specific coordinated roles."
  },
  {
    q: "Why is it correct to say that division of labour happens at the cellular level, as well as in tissues and organs?",
    choices: ["Individual structures inside a single cell have specific, coordinated duties.", "Unicellular organisms do not contain any cytoplasm or chemical reactions.", "Single cells do not possess any organized functions unless they form a system.", "Every part of a cell performs the exact same chemical processes simultaneously."],
    answer: 0, topic: "Division of Labour", explain: "Even within a single cell, organelles like the nucleus (control), membrane (transport), and chloroplast (photosynthesis) each have distinct roles."
  },
  {
    q: "What is the specialized function of guard cells found on the underside of leaves?",
    choices: ["They absorb water directly from deep underground soil layers.", "They control the opening and closing of stomata to regulate gas movement.", "They produce red blood cells to transport mineral salts to branches.", "They provide a rigid structure to keep tree trunks upright."],
    answer: 1, topic: "Division of Labour", explain: "Guard cells change shape to open or close stomata, regulating CO₂ entry, O₂ exit, and water loss through transpiration."
  },
  {
    q: "What is the specialized role of a macrophage cell in human blood?",
    choices: ["Conducting electrical signals throughout the skeletal system.", "Storing massive volumes of food and liquid inside a large central vacuole.", "Destroying invading microorganisms to protect the body.", "Synthesizing sugars through the process of photosynthesis."],
    answer: 2, topic: "Division of Labour", explain: "Macrophages are specialised white blood cells that engulf and destroy pathogens through a process called phagocytosis."
  },
  {
    q: "What is the specialized role of a neuron in the human body?",
    choices: ["Creating artificial body parts via 3D printing mechanisms.", "Conducting electrical signals throughout the body.", "Filtering out carbon dioxide molecules from blood tissues.", "Expanding its tough cell wall to protect bone cells."],
    answer: 1, topic: "Division of Labour", explain: "Neurons have long axons that carry electrical impulses rapidly across the body for communication and coordination."
  },
  {
    q: "A blood vessel contains muscle tissue, elastic tissue, and connective tissue working together to move fluid. This is an example of division of labour at which level?",
    choices: ["Cellular level", "Organ level", "System level", "Unicellular level"],
    answer: 1, topic: "Division of Labour", explain: "A blood vessel is an organ; its different tissue types cooperating within that organ demonstrates organ-level division of labour."
  },
  {
    q: "How does the cooperation between the heart, blood vessels, and blood benefit the human body?",
    choices: ["It ensures the circulatory system functions efficiently to transport substances.", "It transforms red blood cells into root hair cells when needed.", "It allows individual organs to function independently without coordinating.", "It eliminates the need for cells to carry out respiration or chemical reactions."],
    answer: 0, topic: "Division of Labour", explain: "The heart pumps, blood vessels channel, and blood transports — these three organs coordinate to keep the circulatory system running."
  },

  // ── Part 6: Advances in Technology and Knowledge-Building ─────────────────
  {
    q: "How did the historical invention of the light microscope directly alter human understanding of life?",
    choices: ["It immediately proved that human blood does not contain any cells.", "It made the invisible world of cells visible, allowing scientists to study cell structures.", "It allowed bioengineers to 3D print functional human hearts.", "It showed that all living things are made up of artificial intelligence systems."],
    answer: 1, topic: "Cells & Tech", explain: "Before microscopes, cells were invisible; Hooke's microscope (1665) revealed the cellular basis of life for the first time."
  },
  {
    q: "What initial practical interest led Antonie van Leeuwenhoek to develop high-quality lenses and early microscopes?",
    choices: ["He wanted to look at the structure of DNA inside cheek cells.", "He wanted to examine the quality of fibres in his fabric business.", "He was hired to find a vaccine for lethal bacterial anthrax.", "He was searching for single-celled alien life on other planets."],
    answer: 1, topic: "Cells & Tech", explain: "Leeuwenhoek was a draper who needed to assess cloth quality; his lens-grinding skill for this led to powerful microscopes."
  },
  {
    q: "Which milestone in cell knowledge occurred in the 1830s following improvements to light microscopes?",
    choices: ["The initial discovery of electron microscope components.", "The proposal of the theory that all living things are made of cells.", "The first successful 3D printing of a cattle embryo.", "The discovery that red blood cells lack structural cell walls."],
    answer: 1, topic: "Cells & Tech", explain: "In 1838–1839, Schleiden (plants) and Schwann (animals) proposed cell theory: all living things are made of cells."
  },
  {
    q: "What main advantage does an electron microscope offer compared to a standard light microscope?",
    choices: ["It uses visible light to keep cells alive during long observations.", "It allows scientists to view cell structures in much greater detail due to higher magnification.", "It can be easily carried around because it has a smaller arm and base.", "It eliminates the need to use chemical stains like iodine."],
    answer: 1, topic: "Cells & Tech", explain: "Electron microscopes can magnify up to 500,000× (vs ~1,500× for light microscopes), revealing ultra-fine organelle structures."
  },
  {
    q: "What is the scientific purpose of adding chemical stains like methylene blue or iodine solution to a slide specimen?",
    choices: ["To dissolve the cell wall so the nucleus can swim out.", "To color and stain cell structures so they can be seen clearly under a microscope.", "To prevent air bubbles from getting trapped under the coverslip.", "To kill dangerous cells before they divide into tissues."],
    answer: 1, topic: "Cells & Tech", explain: "Stains bind selectively to certain molecules (e.g. methylene blue to DNA in the nucleus), making structures visible against the background."
  },
  {
    q: "How do modern geneticists use cells from an orchid plant to preserve rare or endangered species?",
    choices: ["By changing the plant cell walls into animal cell membranes.", "By utilizing DNA knowledge to produce genetically identical clones.", "By removing the plant's cytoplasm to stop all chemical reactions.", "By transferring chloroplasts into the roots to speed up growth."],
    answer: 1, topic: "Cells & Tech", explain: "By extracting plant cells and using DNA cloning techniques, geneticists can reproduce genetically identical copies of rare orchids."
  },
  {
    q: "Why is the original nucleus removed from the donor's egg cell during the cattle cloning process?",
    choices: ["To make room for the large vacuole to expand.", "To ensure the egg cell does not pass down the egg donor's genetic material to the clone.", "To force the egg cell to transform into a multicellular system.", "To allow the light microscope lenses to see through the slide."],
    answer: 1, topic: "Cells & Tech", explain: "Removing the nucleus ensures only the replacement nucleus donor's DNA determines the clone's genetic makeup."
  },
  {
    q: "Why is a cloned calf physically and genetically identical to the nucleus donor cow?",
    choices: ["The nucleus contains the DNA, which holds the genetic information that determines traits.", "The surrogate mother cow alters the cell wall structure during development.", "The egg donor cow provides all the cytoplasm and chloroplast models.", "The cloning process utilizes artificial intelligence to choose the calf's features."],
    answer: 0, topic: "Cells & Tech", explain: "DNA inside the transferred nucleus contains all the genetic information controlling traits; the clone grows from this DNA."
  },
  {
    q: "What major discovery did Louis Pasteur contribute to medicine after studying disease-causing microorganisms?",
    choices: ["He invented the electron microscope to view cancer cells.", "He found that injecting killed or weakened microorganisms can protect against diseases through vaccination.", "He discovered that red blood cells do not require a nucleus to survive.", "He proved that all bacteria are lethal and cause cholera or tuberculosis."],
    answer: 1, topic: "Cells & Tech", explain: "Pasteur demonstrated that weakened pathogens could stimulate immunity without causing disease — the principle behind all vaccines."
  },
  {
    q: "How do modern bioengineers apply their knowledge of living cells alongside 3D printing technology?",
    choices: ["To manufacture lightweight metal bones for microscopic unicellular organisms.", "To print artificial body parts and organs to assist patients who need transplants.", "To turn plant cell walls into clean energy sources inside classrooms.", "To mass-produce light microscopes for history museums."],
    answer: 1, topic: "Cells & Tech", explain: "Bioengineers use 3D printers loaded with living cells (bioprinting) to create tissues and organs for medical transplantation."
  },
];
