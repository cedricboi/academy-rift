// ===== Academy Rift — question bank (SERVER ONLY) =====
// Chapter 14: Human Digestive System — 100 MCQ.
// `answer` is the 0-based correct index (shuffled so correct is never always slot 0).
// Never served to clients — server sends {q, choices, topic, difficulty} only
// and validates answers itself, so the correct option can't be inspected.
export const QUESTIONS = [
  // Q001 answer→0
  { q: "Why do humans need food?", choices: ["To provide energy and materials needed by the body","To make the stomach larger","To stop the mouth from producing saliva","To remove oxygen from the blood"], answer: 0, topic: "Importance of digestion", difficulty: 1, explain: "Food provides energy and nutrients for growth, repair, heat production and healthy body functions." },
  // Q002 answer→1
  { q: "What is the main role of the human digestive system?", choices: ["To pump blood around the body","To break down food into small soluble molecules that can be absorbed","To exchange oxygen and carbon dioxide in the lungs","To support the bones and muscles"], answer: 1, topic: "Importance of digestion", difficulty: 1, explain: "The digestive system breaks large food molecules into smaller molecules that can enter the bloodstream." },
  // Q003 answer→2
  { q: "Which body process uses digested food molecules to release energy?", choices: ["Excretion","Breathing","Respiration","Sweating"], answer: 2, topic: "Importance of digestion", difficulty: 1, explain: "Respiration uses food molecules such as glucose to release energy for cells." },
  // Q004 answer→3
  { q: "Which of the following is a reason why the body needs nutrients from food?", choices: ["To stop blood from flowing","To make the gullet produce bile","To keep all food molecules large","To grow new cells and repair worn-out tissues"], answer: 3, topic: "Importance of digestion", difficulty: 1, explain: "Nutrients are needed for growth, tissue repair and many life processes." },
  // Q005 answer→0
  { q: "Why must many food molecules be digested before absorption?", choices: ["They are too large to pass through cell membranes or intestine walls","They contain too much oxygen","They are already in the bloodstream","They are always poisonous before digestion"], answer: 0, topic: "Importance of digestion", difficulty: 2, explain: "Large food molecules must be broken into smaller molecules before they can be absorbed." },
  // Q006 answer→1
  { q: "A student says 'Digestion is only about getting energy.' Which response is best?", choices: ["Correct, because food is never used to build body tissues","Not fully correct, because digested food is also used for growth and tissue repair","Correct, because proteins are only used for heat production","Not correct, because digestion removes oxygen from food"], answer: 1, topic: "Importance of digestion", difficulty: 2, explain: "Digested nutrients provide energy, but they also help with growth, repair and other cell processes." },
  // Q007 answer→2
  { q: "Which of the following best describes digestion?", choices: ["Changing oxygen into carbon dioxide","Moving blood from the heart to the body","Breaking large insoluble food molecules into smaller soluble molecules","Removing urine from the kidneys"], answer: 2, topic: "Importance of digestion", difficulty: 1, explain: "Digestion makes food molecules small enough and soluble enough for absorption." },
  // Q008 answer→3
  { q: "What would happen if food was not broken down into small molecules?", choices: ["All nutrients would enter the blood faster","The gullet would digest fats instead","The large intestine would produce all enzymes","Many nutrients could not be absorbed into the bloodstream"], answer: 3, topic: "Importance of digestion", difficulty: 2, explain: "Small molecules are needed for absorption through the small intestine wall and into blood vessels." },
  // Q009 answer→0
  { q: "Which statement about the digestive system is correct?", choices: ["Different organs work together to process food step by step","Only the stomach is involved in digestion","The anus absorbs most digested food","The gullet produces digestive enzymes for fat digestion"], answer: 0, topic: "Importance of digestion", difficulty: 1, explain: "The mouth, gullet, stomach, small intestine, large intestine, rectum and anus work together." },
  // Q010 answer→1
  { q: "Which statement links digestion to body temperature?", choices: ["Digestion cools the body by stopping respiration","Food provides energy that can be used to produce heat and maintain body temperature","Food molecules directly block heat from leaving the mouth","Only undigested fibre is used to produce heat"], answer: 1, topic: "Importance of digestion", difficulty: 2, explain: "Food supplies energy, and energy released in cells helps the body maintain its temperature." },
  // Q011 answer→2
  { q: "Which group of nutrients is the body's main immediate source of energy?", choices: ["Proteins","Fats","Carbohydrates","Mineral salts"], answer: 2, topic: "Nutrients", difficulty: 1, explain: "Carbohydrates such as starch and sugars provide an immediate source of energy." },
  // Q012 answer→3
  { q: "Which nutrient group is mainly used to make new cells and repair worn-out tissues?", choices: ["Fats","Water","Fibre","Proteins"], answer: 3, topic: "Nutrients", difficulty: 1, explain: "Proteins are needed for growth, tissue repair and making enzymes." },
  // Q013 answer→0
  { q: "Which nutrient group acts as an energy reserve and helps reduce heat loss from the body?", choices: ["Fats","Proteins","Carbohydrates","Vitamins only"], answer: 0, topic: "Nutrients", difficulty: 1, explain: "Fats store energy and help insulate the body." },
  // Q014 answer→1
  { q: "Which of the following foods is rich in starch?", choices: ["Egg","Rice","Cheese","Fish"], answer: 1, topic: "Nutrients", difficulty: 1, explain: "Rice, bread, noodles and potatoes are common examples of starchy foods." },
  // Q015 answer→2
  { q: "Which of the following foods is a good source of protein?", choices: ["Sugar","Butter","Egg","Potato"], answer: 2, topic: "Nutrients", difficulty: 1, explain: "Meat, fish, milk, yoghurt and eggs are common protein-rich foods." },
  // Q016 answer→3
  { q: "Which of the following foods is a source of fat?", choices: ["Rice","Apple","Plain water","Butter"], answer: 3, topic: "Nutrients", difficulty: 1, explain: "Butter and cheese are examples of fatty foods." },
  // Q017 answer→0
  { q: "Which statement about cellulose is correct?", choices: ["It is fibre that humans cannot digest and it adds bulk to faeces","It is a protein digested into amino acids","It is a fat digested in the stomach","It is absorbed directly into the bloodstream as glucose"], answer: 0, topic: "Nutrients", difficulty: 2, explain: "Cellulose is plant fibre. Humans cannot digest it, so it helps form bulk in faeces." },
  // Q018 answer→1
  { q: "Proteins are made up of smaller molecules called what?", choices: ["Fatty acids","Amino acids","Glycerol","Glucose"], answer: 1, topic: "Nutrients", difficulty: 2, explain: "Proteins are digested into amino acids." },
  // Q019 answer→2
  { q: "Fats are digested into which end-products?", choices: ["Glucose only","Amino acids only","Fatty acids and glycerol","Water and mineral salts"], answer: 2, topic: "Nutrients", difficulty: 2, explain: "Lipases digest fats into fatty acids and glycerol." },
  // Q020 answer→3
  { q: "Starch is digested into which smaller molecule?", choices: ["Amino acids","Fatty acids","Glycerol","Glucose"], answer: 3, topic: "Nutrients", difficulty: 2, explain: "Carbohydrases digest starch into glucose." },
  // Q021 answer→0
  { q: "Which option correctly matches nutrient to end-product of digestion?", choices: ["Protein → amino acids","Starch → fatty acids and glycerol","Fat → glucose","Cellulose → amino acids"], answer: 0, topic: "Nutrients", difficulty: 3, explain: "Proteins are digested by proteases into amino acids." },
  // Q022 answer→1
  { q: "Why can glucose be absorbed more easily than starch?", choices: ["Glucose is a type of fibre","Glucose is a smaller molecule than starch","Glucose is made only in the large intestine","Starch is already in the blood"], answer: 1, topic: "Nutrients", difficulty: 3, explain: "Starch is a large carbohydrate and must be digested into smaller glucose molecules first." },
  // Q023 answer→2
  { q: "Which of the following is the correct order of food movement through the alimentary canal?", choices: ["Mouth → stomach → gullet → large intestine → small intestine → anus → rectum","Gullet → mouth → stomach → rectum → small intestine → anus → large intestine","Mouth → gullet → stomach → small intestine → large intestine → rectum → anus","Mouth → liver → stomach → pancreas → rectum → anus"], answer: 2, topic: "Alimentary canal", difficulty: 1, explain: "Food travels through the alimentary canal from the mouth to the anus in this order." },
  // Q024 answer→3
  { q: "Which organ receives food first?", choices: ["Stomach","Small intestine","Large intestine","Mouth"], answer: 3, topic: "Alimentary canal", difficulty: 1, explain: "Food enters the digestive system through the mouth." },
  // Q025 answer→0
  { q: "What is the function of teeth in digestion?", choices: ["To cut and grind food into smaller pieces","To absorb glucose into the blood","To produce bile","To store faeces"], answer: 0, topic: "Mouth", difficulty: 1, explain: "Teeth carry out physical digestion by cutting and grinding food." },
  // Q026 answer→1
  { q: "What is the function of the tongue during swallowing?", choices: ["It absorbs water from undigested food","It forms a bolus and pushes food to the back of the mouth","It produces hydrochloric acid","It stores bile"], answer: 1, topic: "Mouth", difficulty: 1, explain: "The tongue forms food into a bolus and helps push it into the gullet." },
  // Q027 answer→2
  { q: "Which statement about saliva is correct?", choices: ["Saliva contains bile and digests fats into fatty acids","Saliva stores faeces before removal","Saliva moistens food and contains a carbohydrase that starts starch digestion","Saliva absorbs digested molecules into the blood"], answer: 2, topic: "Mouth", difficulty: 2, explain: "Saliva moistens food and contains a carbohydrase that begins chemical digestion of starch." },
  // Q028 answer→3
  { q: "What is a bolus?", choices: ["A digestive enzyme that digests fats","A tube connecting the liver to the gall bladder","A storage organ for faeces","A ball of chewed food formed in the mouth"], answer: 3, topic: "Mouth", difficulty: 2, explain: "A bolus is the ball-like mass of chewed food formed before swallowing." },
  // Q029 answer→0
  { q: "What is the main function of the gullet (oesophagus)?", choices: ["To transport food from the mouth to the stomach","To digest fats using bile","To absorb glucose into the bloodstream","To store undigested food as faeces"], answer: 0, topic: "Gullet", difficulty: 1, explain: "The gullet transports food only. It moves food to the stomach." },
  // Q030 answer→1
  { q: "What is peristalsis?", choices: ["The digestion of fat by bile","Wave-like muscle contractions that push food along the gut","The absorption of water in the colon","The release of glucose from the pancreas"], answer: 1, topic: "Gullet", difficulty: 2, explain: "Peristalsis is the coordinated contraction and relaxation of gut muscles that moves food forward." },
  // Q031 answer→2
  { q: "During peristalsis in the gullet, what happens above the ball of food?", choices: ["Muscles absorb glucose","Bile is released","Muscles contract to push the food down","The rectum stores the food"], answer: 2, topic: "Gullet", difficulty: 2, explain: "Muscles above the bolus contract, pushing the food downward." },
  // Q032 answer→3
  { q: "During peristalsis in the gullet, what happens below the ball of food?", choices: ["Muscles produce bile","Muscles form amino acids","Muscles absorb mineral salts","Muscles relax so the tube widens"], answer: 3, topic: "Gullet", difficulty: 2, explain: "Muscles below the bolus relax, making space for food to move down." },
  // Q033 answer→0
  { q: "What does the stomach do to food?", choices: ["It churns food and mixes it with gastric juice","It absorbs most final products of digestion into blood","It stores bile before release","It removes faeces from the body"], answer: 0, topic: "Stomach", difficulty: 1, explain: "The stomach contracts and relaxes to break food down further and mix it with gastric juice." },
  // Q034 answer→1
  { q: "Which enzyme class acts on proteins in the stomach?", choices: ["Carbohydrase","Protease","Lipase","Bile"], answer: 1, topic: "Stomach", difficulty: 1, explain: "Proteases digest proteins into smaller molecules." },
  // Q035 answer→2
  { q: "Which substance is found in gastric juice besides enzymes?", choices: ["Bile","Faeces","Hydrochloric acid","Cellulose"], answer: 2, topic: "Stomach", difficulty: 2, explain: "Gastric juice contains protease and hydrochloric acid." },
  // Q036 answer→3
  { q: "Which type of digestion happens when the stomach muscles contract and relax to churn food?", choices: ["Photosynthesis","Absorption","Excretion","Physical digestion"], answer: 3, topic: "Stomach", difficulty: 2, explain: "Churning breaks food into smaller pieces physically without changing the chemical molecules directly." },
  // Q037 answer→0
  { q: "Which type of digestion happens when protease breaks proteins into smaller molecules?", choices: ["Chemical digestion","Physical digestion only","Emulsification only","Defecation"], answer: 0, topic: "Stomach", difficulty: 2, explain: "Enzymes carry out chemical digestion by breaking large food molecules into smaller ones." },
  // Q038 answer→1
  { q: "Where are the final products of digestion mainly absorbed into the bloodstream?", choices: ["Gullet","Small intestine","Rectum","Mouth"], answer: 1, topic: "Small intestine", difficulty: 1, explain: "The small intestine is the main site of absorption of digested food molecules." },
  // Q039 answer→2
  { q: "Which substances are mixed with food in the small intestine to help digestion?", choices: ["Only saliva and faeces","Only hydrochloric acid and mucus","Intestinal juice, pancreatic juice and bile","Blood, oxygen and carbon dioxide"], answer: 2, topic: "Small intestine", difficulty: 2, explain: "Food in the small intestine mixes with intestinal juice, pancreatic juice and bile." },
  // Q040 answer→3
  { q: "What happens to undigested food after it leaves the small intestine?", choices: ["It goes back to the mouth","It enters the bloodstream as glucose","It is stored in the gall bladder","It passes into the large intestine"], answer: 3, topic: "Small intestine", difficulty: 2, explain: "Undigested food moves from the small intestine into the large intestine." },
  // Q041 answer→0
  { q: "What is the main function of the large intestine?", choices: ["To absorb water and mineral salts from undigested food","To digest starch into glucose","To produce bile","To transport food from the mouth to the stomach"], answer: 0, topic: "Large intestine", difficulty: 1, explain: "The colon of the large intestine absorbs water and mineral salts." },
  // Q042 answer→1
  { q: "Which part temporarily stores faeces before they leave the body?", choices: ["Small intestine","Rectum","Gullet","Gall bladder"], answer: 1, topic: "Large intestine", difficulty: 1, explain: "The rectum temporarily stores faeces." },
  // Q043 answer→2
  { q: "Through which part do faeces leave the body?", choices: ["Mouth","Stomach","Anus","Pancreas"], answer: 2, topic: "Large intestine", difficulty: 1, explain: "Faeces are removed from the body through the anus." },
  // Q044 answer→3
  { q: "Which substance is most likely to remain undigested and add bulk to faeces?", choices: ["Glucose","Amino acids","Fatty acids","Cellulose fibre"], answer: 3, topic: "Large intestine", difficulty: 2, explain: "Humans cannot digest cellulose fibre, so it remains undigested." },
  // Q045 answer→0
  { q: "Which organ produces bile?", choices: ["Liver","Stomach","Mouth","Rectum"], answer: 0, topic: "Accessory organs", difficulty: 1, explain: "Bile is produced by the liver." },
  // Q046 answer→1
  { q: "Where is bile stored before it is released into the small intestine?", choices: ["Pancreas","Gall bladder","Large intestine","Oesophagus"], answer: 1, topic: "Accessory organs", difficulty: 1, explain: "Bile is stored in the gall bladder before being released through the bile duct." },
  // Q047 answer→2
  { q: "Which organ produces pancreatic juice?", choices: ["Liver","Rectum","Pancreas","Gullet"], answer: 2, topic: "Accessory organs", difficulty: 2, explain: "The pancreas produces pancreatic juice containing digestive enzymes." },
  // Q048 answer→3
  { q: "Which statement about bile is correct?", choices: ["Bile is a protease that digests proteins","Bile is produced by the gullet","Bile absorbs glucose into the blood","Bile contains no enzymes and helps emulsify fats"], answer: 3, topic: "Accessory organs", difficulty: 2, explain: "Bile does not contain enzymes. It breaks large fat drops into smaller droplets." },
  // Q049 answer→0
  { q: "How does bile reach the small intestine?", choices: ["It is released from the gall bladder through the bile duct","It is swallowed from the mouth","It travels through the gullet with food","It is absorbed from the large intestine into blood"], answer: 0, topic: "Accessory organs", difficulty: 2, explain: "When we eat, the gall bladder releases bile into the small intestine through the bile duct." },
  // Q050 answer→1
  { q: "Which pair correctly matches a gland to a secretion?", choices: ["Liver → intestinal juice","Pancreas → pancreatic juice","Small intestine → bile","Rectum → saliva"], answer: 1, topic: "Accessory organs", difficulty: 3, explain: "The pancreas produces pancreatic juice. The liver produces bile and the small intestine produces intestinal juice." },
  // Q051 answer→2
  { q: "Which is an example of physical digestion?", choices: ["Carbohydrase breaking starch into glucose","Protease breaking protein into amino acids","Teeth grinding food into smaller pieces","Lipase breaking fat into fatty acids and glycerol"], answer: 2, topic: "Physical and chemical digestion", difficulty: 1, explain: "Physical digestion breaks food into smaller pieces without changing the food molecules chemically." },
  // Q052 answer→3
  { q: "Which is an example of chemical digestion?", choices: ["Teeth cutting food into smaller pieces","The rectum storing faeces","The gullet moving food to the stomach","Enzymes breaking large food molecules into smaller molecules"], answer: 3, topic: "Physical and chemical digestion", difficulty: 1, explain: "Chemical digestion uses enzymes to break down large food molecules." },
  // Q053 answer→0
  { q: "Which statement best compares physical and chemical digestion?", choices: ["Physical digestion makes food pieces smaller; chemical digestion breaks molecules into smaller molecules","Physical digestion uses enzymes; chemical digestion uses teeth only","Physical digestion happens only in the blood; chemical digestion happens only in bones","Physical digestion absorbs food; chemical digestion stores faeces"], answer: 0, topic: "Physical and chemical digestion", difficulty: 2, explain: "Physical digestion changes size of food pieces, while chemical digestion changes large molecules into smaller molecules." },
  // Q054 answer→1
  { q: "Why does chewing help digestion?", choices: ["It makes all enzymes stop working","It increases the surface area of food for enzymes to act on","It absorbs proteins directly into the blood","It produces bile in the mouth"], answer: 1, topic: "Physical and chemical digestion", difficulty: 2, explain: "Smaller food pieces expose more surface area, helping enzymes digest food faster." },
  // Q055 answer→2
  { q: "Which pair shows one physical digestion process and one chemical digestion process?", choices: ["Absorbing water; storing faeces","Moving food in the gullet; removing faeces","Chewing food; carbohydrase digesting starch","Producing bile; storing bile"], answer: 2, topic: "Physical and chemical digestion", difficulty: 2, explain: "Chewing is physical digestion. Enzyme action on starch is chemical digestion." },
  // Q056 answer→3
  { q: "What is the role of digestive enzymes?", choices: ["To store faeces in the rectum","To transport food through the gullet only","To absorb water in the colon only","To break large food molecules into smaller food molecules"], answer: 3, topic: "Enzymes", difficulty: 1, explain: "Digestive enzymes speed up the breakdown of food molecules." },
  // Q057 answer→0
  { q: "Which enzyme class digests carbohydrates such as starch?", choices: ["Carbohydrase","Protease","Lipase","Bile"], answer: 0, topic: "Enzymes", difficulty: 1, explain: "Carbohydrases digest carbohydrates such as starch." },
  // Q058 answer→1
  { q: "Which enzyme class digests proteins?", choices: ["Carbohydrase","Protease","Lipase","Bile"], answer: 1, topic: "Enzymes", difficulty: 1, explain: "Proteases digest proteins into amino acids." },
  // Q059 answer→2
  { q: "Which enzyme class digests fats?", choices: ["Protease","Carbohydrase","Lipase","Hydrochloric acid"], answer: 2, topic: "Enzymes", difficulty: 1, explain: "Lipases digest fats into fatty acids and glycerol." },
  // Q060 answer→3
  { q: "Which option correctly matches enzyme class to food molecule?", choices: ["Protease → fat","Lipase → protein","Bile → starch","Carbohydrase → starch"], answer: 3, topic: "Enzymes", difficulty: 2, explain: "Carbohydrases digest carbohydrates such as starch." },
  // Q061 answer→0
  { q: "Which option correctly matches enzyme class to product?", choices: ["Lipase → fatty acids and glycerol","Protease → glucose","Carbohydrase → amino acids","Bile → proteins"], answer: 0, topic: "Enzymes", difficulty: 2, explain: "Lipases digest fats into fatty acids and glycerol." },
  // Q062 answer→1
  { q: "Where can carbohydrase, protease and lipase all be found?", choices: ["Only in bile","In intestinal juice and pancreatic juice","Only in the rectum","Only in the gullet"], answer: 1, topic: "Enzymes", difficulty: 2, explain: "Intestinal juice and pancreatic juice contain carbohydrase, protease and lipase." },
  // Q063 answer→2
  { q: "A food sample contains mostly starch. Which enzyme class would digest it most directly?", choices: ["Protease","Lipase","Carbohydrase","Bile"], answer: 2, topic: "Enzymes", difficulty: 3, explain: "Starch is a carbohydrate, so it is digested by carbohydrase." },
  // Q064 answer→3
  { q: "A food sample contains mostly meat protein. Which enzyme class would digest it most directly?", choices: ["Lipase","Carbohydrase","Bile","Protease"], answer: 3, topic: "Enzymes", difficulty: 3, explain: "Protein is digested by protease into amino acids." },
  // Q065 answer→0
  { q: "A food sample contains mostly butter. Which enzyme class is most important for chemically digesting it?", choices: ["Lipase","Protease","Carbohydrase","Cellulose"], answer: 0, topic: "Enzymes", difficulty: 3, explain: "Butter is rich in fat, so lipase digests it." },
  // Q066 answer→1
  { q: "Which digestive juice contains protease and hydrochloric acid?", choices: ["Bile","Gastric juice","Saliva only","Faeces"], answer: 1, topic: "Enzymes", difficulty: 2, explain: "Gastric juice in the stomach contains protease and hydrochloric acid." },
  // Q067 answer→2
  { q: "Which statement about bile and enzymes is correct?", choices: ["Bile is a carbohydrase","Bile digests proteins into amino acids","Bile helps fat digestion but is not an enzyme","Bile is produced in the mouth"], answer: 2, topic: "Enzymes", difficulty: 2, explain: "Bile emulsifies fats. It contains no digestive enzymes." },
  // Q068 answer→3
  { q: "Why does emulsification help lipase digest fats faster?", choices: ["It changes fats directly into glucose","It removes all enzymes from the small intestine","It makes fats insoluble so they cannot be digested","It breaks large fat drops into small droplets with greater surface area"], answer: 3, topic: "Enzymes", difficulty: 3, explain: "Small fat droplets provide more surface area for lipase to act on." },
  // Q069 answer→0
  { q: "Which process describes bile breaking a large drop of fat into many small droplets?", choices: ["Emulsification","Peristalsis","Absorption","Respiration"], answer: 0, topic: "Enzymes", difficulty: 2, explain: "Emulsification is the breakdown of large fat drops into smaller droplets by bile." },
  // Q070 answer→1
  { q: "Which sequence correctly shows fat processing in the small intestine?", choices: ["Lipase stores fats in the rectum, then bile absorbs them into blood","Bile emulsifies fats, then lipase digests fats into fatty acids and glycerol","Protease changes fats into amino acids, then carbohydrase forms bile","Bile changes fats into glucose, then the gullet absorbs glucose"], answer: 1, topic: "Enzymes", difficulty: 3, explain: "Bile emulsifies fats, and lipase digests fats chemically." },
  // Q071 answer→2
  { q: "What is absorption in digestion?", choices: ["The chewing of food into smaller pieces","The production of bile by the liver","The movement of small digested food molecules into the bloodstream","The removal of faeces through the anus"], answer: 2, topic: "Absorption", difficulty: 1, explain: "Absorption happens when small food molecules pass into blood vessels." },
  // Q072 answer→3
  { q: "Which molecules can pass through the wall of the small intestine and blood vessels most easily?", choices: ["Large undigested starch molecules","Whole pieces of meat","Large drops of fat only","Small digested food molecules"], answer: 3, topic: "Absorption", difficulty: 2, explain: "Only small digested molecules can pass through the small intestine wall and into blood vessels." },
  // Q073 answer→0
  { q: "After digested food molecules enter the bloodstream, what happens next?", choices: ["They are transported around the body to cells","They immediately leave the body through the anus","They move back into the mouth","They become bile in the gall bladder"], answer: 0, topic: "Absorption", difficulty: 2, explain: "The bloodstream carries absorbed food molecules to body cells." },
  // Q074 answer→1
  { q: "Which organ is most directly involved in absorbing digested glucose into the blood?", choices: ["Gullet","Small intestine","Rectum","Anus"], answer: 1, topic: "Absorption", difficulty: 2, explain: "The small intestine absorbs final products of digestion such as glucose." },
  // Q075 answer→2
  { q: "Why is the small intestine placed after the stomach in the alimentary canal?", choices: ["Food must be stored as faeces before stomach digestion","Bile must be produced by the anus first","Food is partly digested first, then final digestion and absorption can occur","The gullet absorbs all nutrients before food reaches the stomach"], answer: 2, topic: "Absorption", difficulty: 3, explain: "The stomach begins important digestion, and the small intestine completes digestion and absorbs the products." },
  // Q076 answer→3
  { q: "Which digested food molecule is commonly used in respiration to release energy?", choices: ["Cellulose","Bile","Faeces","Glucose"], answer: 3, topic: "End-product use", difficulty: 1, explain: "Glucose is used by cells in respiration to release energy." },
  // Q077 answer→0
  { q: "What are amino acids mainly used for after absorption?", choices: ["Growth and repair of body tissues","Making bile in the rectum","Forming undigested faeces only","Changing glucose into oxygen"], answer: 0, topic: "End-product use", difficulty: 2, explain: "Amino acids are used to build proteins for growth and tissue repair." },
  // Q078 answer→1
  { q: "How are fatty acids and glycerol useful to the body?", choices: ["They are always excreted immediately as faeces","They can be used as energy sources and for making body materials","They are used only to make saliva","They stop all cell repair"], answer: 1, topic: "End-product use", difficulty: 2, explain: "Fat digestion products can be used for energy storage, cell structures and other body needs." },
  // Q079 answer→2
  { q: "Which option correctly links digestion to cell processes?", choices: ["Digestion provides bile for respiration and faeces for tissue repair","Digestion makes oxygen for growth and carbon dioxide for repair","Digestion provides glucose for respiration and amino acids for growth and repair","Digestion turns all food into fibre for respiration"], answer: 2, topic: "End-product use", difficulty: 3, explain: "Glucose supports respiration, while amino acids support protein-building for growth and repair." },
  // Q080 answer→3
  { q: "Which statement about absorbed nutrients is correct?", choices: ["They stay permanently inside the small intestine","They are stored only in the gullet","They are all converted into faeces","Body cells take them up and use them for respiration, repair and other processes"], answer: 3, topic: "End-product use", difficulty: 2, explain: "Absorbed nutrients are carried by blood and used by cells throughout the body." },
  // Q081 answer→0
  { q: "Why do the parts of the digestive system need to work together?", choices: ["Each part performs a different step needed to digest, absorb or remove food waste","Each part does exactly the same job at the same time","Only the mouth is needed for digestion","The large intestine digests all nutrients before food reaches the stomach"], answer: 0, topic: "Organ cooperation", difficulty: 2, explain: "Different organs carry out different functions, so the system works as a coordinated pathway." },
  // Q082 answer→1
  { q: "What would most likely happen if the gullet did not connect properly to the stomach?", choices: ["The small intestine would absorb more glucose from the mouth","Food and saliva would not enter the stomach normally","Bile would be produced in the gullet","The rectum would digest protein instead"], answer: 1, topic: "Organ cooperation", difficulty: 3, explain: "If the gullet does not connect to the stomach, food cannot be transported normally into the stomach." },
  // Q083 answer→2
  { q: "What would be a likely effect if the small intestine could not absorb digested food molecules?", choices: ["The mouth would produce more bile to solve the problem fully","All food would be absorbed in the gullet instead","Cells would receive fewer nutrients for respiration, growth and repair","Proteins would no longer need digestion"], answer: 2, topic: "Organ cooperation", difficulty: 3, explain: "The small intestine is the main absorption site, so failure there reduces nutrient supply to cells." },
  // Q084 answer→3
  { q: "What could happen if the large intestine failed to absorb enough water?", choices: ["Food would not be swallowed","Bile would stop emulsifying fats","The stomach would stop producing all muscle movements","Faeces may become too watery"], answer: 3, topic: "Organ cooperation", difficulty: 3, explain: "The large intestine absorbs water. If this is reduced, faeces can remain watery." },
  // Q085 answer→0
  { q: "What would happen if the pancreas did not release enough pancreatic juice into the small intestine?", choices: ["Digestion of carbohydrates, proteins and fats in the small intestine may be reduced","Food would no longer move through the gullet","The rectum would absorb glucose instead","Teeth would stop carrying out physical digestion"], answer: 0, topic: "Organ cooperation", difficulty: 3, explain: "Pancreatic juice contains carbohydrase, protease and lipase, so less pancreatic juice can reduce chemical digestion." },
  // Q086 answer→1
  { q: "A student eats rice, chicken and butter. Which enzyme classes are needed to digest these main nutrients?", choices: ["Protease only","Carbohydrase, protease and lipase","Bile only","Carbohydrase and bile only"], answer: 1, topic: "Application", difficulty: 2, explain: "Rice contains starch, chicken contains protein and butter contains fat. These need carbohydrase, protease and lipase." },
  // Q087 answer→2
  { q: "A student eats noodles. Which end-product will come mainly from digesting the starch in the noodles?", choices: ["Amino acids","Fatty acids","Glucose","Glycerol only"], answer: 2, topic: "Application", difficulty: 2, explain: "Starch is digested by carbohydrase into glucose." },
  // Q088 answer→3
  { q: "A student eats fish. Which end-products are mainly produced from the protein in fish?", choices: ["Glucose","Fatty acids and glycerol only","Bile","Amino acids"], answer: 3, topic: "Application", difficulty: 2, explain: "Proteins in fish are digested by protease into amino acids." },
  // Q089 answer→0
  { q: "A student eats cheese. Which enzyme class helps digest the fat in cheese?", choices: ["Lipase","Protease only","Carbohydrase only","Bile as an enzyme"], answer: 0, topic: "Application", difficulty: 2, explain: "Lipase digests fats. Bile helps by emulsifying fats but is not an enzyme." },
  // Q090 answer→1
  { q: "A meal reaches the small intestine. Which process must happen before glucose can be used by muscle cells?", choices: ["Glucose must become cellulose in the large intestine","Glucose must be absorbed into the blood and transported to the cells","Glucose must be stored in the rectum as faeces","Glucose must be changed into bile by the pancreas"], answer: 1, topic: "Application", difficulty: 3, explain: "Digested glucose is absorbed into blood, transported around the body and taken up by cells." },
  // Q091 answer→2
  { q: "Which lifestyle choice can help reduce the risk of type 2 diabetes?", choices: ["Drinking sugary drinks every day and avoiding exercise","Eating only sweets before every meal","Eating a balanced diet and staying physically active","Skipping all meals and never drinking water"], answer: 2, topic: "Diabetes and lifestyle", difficulty: 1, explain: "Sensible food choices and regular activity help support healthy blood sugar control." },
  // Q092 answer→3
  { q: "Why should a person avoid taking too many sugary drinks regularly?", choices: ["They contain protease that digests the stomach","They stop the gullet from carrying food","They turn all proteins into bile","They can add a large amount of sugar to the diet and make blood sugar control harder"], answer: 3, topic: "Diabetes and lifestyle", difficulty: 2, explain: "Frequent high-sugar intake can make it harder to maintain healthy blood sugar levels." },
  // Q093 answer→0
  { q: "Which meal choice is generally more sensible for supporting healthy blood sugar levels?", choices: ["A balanced meal with whole grains, vegetables and protein","A meal made only of sweets and soft drinks","A meal with no nutrients at all","A meal made only of butter"], answer: 0, topic: "Diabetes and lifestyle", difficulty: 2, explain: "Balanced meals help provide nutrients without overloading the body with simple sugars." },
  // Q094 answer→1
  { q: "Which statement best shows appreciation of sensible food choices in fighting diabetes?", choices: ["Eating more sugar always prevents diabetes","Choosing balanced meals and limiting high-sugar foods can support long-term health","Only digestion matters, so lifestyle choices are irrelevant","Avoiding all carbohydrates permanently is the only healthy choice for everyone"], answer: 1, topic: "Diabetes and lifestyle", difficulty: 3, explain: "Sensible, balanced eating habits can help support healthy blood sugar control and overall health." },
  // Q095 answer→2
  { q: "Which statement about bacteria in the digestive tract is correct?", choices: ["All bacteria in the gut always cause disease","No bacteria can live in the digestive tract","Some bacteria can be helpful, while some can be harmful","Bacteria are the same as digestive enzymes"], answer: 2, topic: "Bacteria in digestion", difficulty: 1, explain: "Gut bacteria can have beneficial or harmful effects depending on the type and situation." },
  // Q096 answer→3
  { q: "How can some bacteria in the digestive tract be beneficial?", choices: ["They always block nutrient absorption completely","They produce bile in the gall bladder","They replace the need for the stomach","They can help with digestion and support gut health"], answer: 3, topic: "Bacteria in digestion", difficulty: 2, explain: "Some gut bacteria help digestion and contribute to a healthy digestive tract." },
  // Q097 answer→0
  { q: "How can harmful bacteria affect the digestive system?", choices: ["They can cause infections and digestive illness","They always improve digestion with no risks","They turn glucose into teeth","They stop the need for water absorption"], answer: 0, topic: "Bacteria in digestion", difficulty: 2, explain: "Harmful bacteria can cause infections and symptoms such as stomach upset." },
  // Q098 answer→1
  { q: "Which action helps reduce the chance of harmful bacteria entering the digestive system?", choices: ["Eating food dropped on dirty surfaces","Washing hands before eating and handling food safely","Never washing fruits or vegetables","Sharing unwashed utensils with many people"], answer: 1, topic: "Bacteria in digestion", difficulty: 3, explain: "Good hygiene and safe food handling reduce the risk of harmful bacteria causing infection." },
  // Q099 answer→2
  { q: "A student says 'All bacteria should be removed from the digestive tract.' What is the best response?", choices: ["Correct, because bacteria never help the body","Correct, because bacteria are the same as faeces","Not fully correct, because some gut bacteria are beneficial while harmful ones can cause infections","Not correct, because bacteria digest food only in the mouth"], answer: 2, topic: "Bacteria in digestion", difficulty: 3, explain: "The digestive tract can contain helpful bacteria, but harmful bacteria may cause illness." },
  // Q100 answer→3
  { q: "Which summary best describes the human digestive system?", choices: ["It pumps blood, filters urine and controls breathing","It only stores food without changing it","It only removes water from food and does nothing else","It breaks food down, absorbs useful molecules into the blood, and removes undigested waste"], answer: 3, topic: "Chapter synthesis", difficulty: 3, explain: "The digestive system carries out digestion, absorption and removal of undigested waste." },
];
