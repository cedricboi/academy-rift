// ===== Academy Rift — folders for question sets (shared by the hub, the game and the teacher page) =====
// Every question set sits in one folder. Sets that come with the game (library/) carry their folder;
// a teacher's own set picks one in the hub. Anything without a folder goes in the last one.
export const FOLDERS = [
  { id: "sec1", name: "Sec 1 Science", blurb: "Chapters 1 to 8" },
  { id: "sec2", name: "Sec 2 Science", blurb: "Chapters 9 to 16" },
  { id: "sec3g1", name: "Sec 3 G1 Science", blurb: "Everything else" },
];
export const DEFAULT_FOLDER = "sec3g1";
export const FOLDER_BY_ID = Object.fromEntries(FOLDERS.map((f) => [f.id, f]));
export const folderOf = (id) => (FOLDER_BY_ID[id] ? id : DEFAULT_FOLDER);
