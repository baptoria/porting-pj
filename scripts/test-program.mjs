// Original DOS fixture, CC0-1.0. Tiny 16-bit assembler, no third-party game data.
import { strToU8 } from "fflate";
export function testProgram() {
  const b = [],
    labels = {},
    fix = [];
  const emit = (...x) => b.push(...x),
    word = (n) => emit(n & 255, (n >> 8) & 255),
    label = (n) => (labels[n] = b.length);
  const ptr = (n) => {
    fix.push({ at: b.length, name: n, relative: false });
    word(0);
  };
  const jump = (opcode, n) => {
    emit(...opcode);
    fix.push({ at: b.length, name: n, relative: true });
    word(0);
  };
  const print = (n) => {
    emit(0xba);
    ptr(n);
    emit(0xb4, 9, 0xcd, 0x21);
  };
  const string = (n, s) => {
    label(n);
    emit(...strToU8(s));
  };
  label("start");
  print("banner");
  label("loop");
  emit(0x30, 0xe4, 0xcd, 0x16, 0x0c, 0x20); // BIOS wait, lowercase
  emit(0x3c, 0x73);
  jump([0x0f, 0x84], "save");
  emit(0x3c, 0x6c);
  jump([0x0f, 0x84], "load");
  emit(0x3c, 0x71);
  jump([0x0f, 0x84], "quit");
  emit(0x3c, 0x64);
  jump([0x0f, 0x84], "delete");
  emit(0x3c, 0x72);
  jump([0x0f, 0x84], "resource");
  emit(0x3c, 0x78);
  jump([0x0f, 0x84], "deleteResource");
  emit(0x3c, 0x6d);
  jump([0x0f, 0x84], "musicOne");
  emit(0x3c, 0x6e);
  jump([0x0f, 0x84], "musicTwo");
  print("key");
  jump([0xe9], "loop");
  label("musicOne");
  emit(0xba);
  ptr("trackOne");
  jump([0xe9], "readMusic");
  label("musicTwo");
  emit(0xba);
  ptr("trackTwo");
  label("readMusic");
  emit(0xb8, 0, 0x3d, 0xcd, 0x21);
  jump([0x0f, 0x82], "error");
  emit(0x89, 0xc3, 0xba);
  ptr("buffer");
  emit(0xb9, 8, 0, 0xb4, 0x3f, 0xcd, 0x21);
  // Print synthetic header marker, then read the final four bytes using seek.
  emit(0x53, 0xbb, 1, 0, 0xb9, 8, 0, 0xb4, 0x40, 0xcd, 0x21, 0x5b);
  emit(0xb8, 2, 0x42, 0xb9, 0xff, 0xff, 0xba, 0xfc, 0xff, 0xcd, 0x21);
  jump([0x0f, 0x82], "error");
  emit(0xba);
  ptr("buffer");
  emit(0xb9, 4, 0, 0xb4, 0x3f, 0xcd, 0x21);
  jump([0x0f, 0x82], "error");
  emit(0x3d, 4, 0);
  jump([0x0f, 0x85], "error");
  emit(0xb4, 0x3e, 0xcd, 0x21);
  print("musicRead");
  jump([0xe9], "loop");
  label("delete");
  emit(0xba);
  ptr("filename");
  emit(0xb4, 0x41, 0xcd, 0x21);
  jump([0x0f, 0x82], "error");
  print("deleted");
  jump([0xe9], "loop");
  label("resource");
  emit(0xba);
  ptr("resourceName");
  emit(0x31, 0xc9, 0xb4, 0x3c, 0xcd, 0x21);
  jump([0x0f, 0x82], "error");
  emit(0x89, 0xc3, 0xba);
  ptr("resourcePayload");
  emit(0xb9);
  word(strToU8("RESOURCE_CHANGED\r\n").length);
  emit(0xb4, 0x40, 0xcd, 0x21, 0xb4, 0x3e, 0xcd, 0x21);
  print("resourceWritten");
  jump([0xe9], "loop");
  label("deleteResource");
  emit(0xba);
  ptr("resourceName");
  emit(0xb4, 0x41, 0xcd, 0x21);
  jump([0x0f, 0x82], "error");
  print("resourceDeleted");
  jump([0xe9], "loop");
  label("save");
  emit(0xba);
  ptr("filename");
  emit(0x31, 0xc9, 0xb4, 0x3c, 0xcd, 0x21);
  jump([0x0f, 0x82], "error");
  emit(0x89, 0xc3, 0xba);
  ptr("payload");
  emit(0xb9);
  word(strToU8("ED4_SAVE_OK!\r\n").length);
  emit(0xb4, 0x40, 0xcd, 0x21, 0xb4, 0x3e, 0xcd, 0x21);
  print("saved");
  jump([0xe9], "loop");
  label("load");
  emit(0xba);
  ptr("filename");
  emit(0xb8, 0x00, 0x3d, 0xcd, 0x21);
  jump([0x0f, 0x82], "error");
  emit(0x89, 0xc3, 0xba);
  ptr("buffer");
  emit(
    0xb9,
    0x40,
    0x00,
    0xb4,
    0x3f,
    0xcd,
    0x21,
    0x50,
    0xb4,
    0x3e,
    0xcd,
    0x21,
    0x59,
    0xbb,
    1,
    0,
    0xba,
  );
  ptr("buffer");
  emit(0xb4, 0x40, 0xcd, 0x21);
  jump([0xe9], "loop");
  label("error");
  print("missing");
  jump([0xe9], "loop");
  label("quit");
  emit(0xb8, 0, 0x4c, 0xcd, 0x21);
  string(
    "banner",
    "\r\nED4 MOBILE - PUBLIC DOS TEST\r\nED4 TEST READY\r\n[S] SAVE [L] LOAD [D] DELETE [Q] QUIT\r\n[R] RESOURCE WRITE [X] RESOURCE DELETE\r\nArrow/Enter/Esc: KEY RECEIVED\r\n$",
  );
  string("key", "KEY RECEIVED\r\n$");
  string("saved", "SAVE WRITTEN\r\n\x07$");
  string("missing", "NO SAVE FILE\r\n$");
  string("filename", "TEST.SAV\0");
  string("payload", "ED4_SAVE_OK!\r\n");
  string("deleted", "SAVE DELETED\r\n$");
  string("resourceName", "RESOURCE.DAT\0");
  string("resourcePayload", "RESOURCE_CHANGED\r\n");
  string("resourceWritten", "RESOURCE WRITTEN\r\n$");
  string("resourceDeleted", "RESOURCE DELETED\r\n$");
  string("trackOne", "ED4-01.RAW\0");
  string("trackTwo", "ED4-02.RAW\0");
  string("musicRead", " RAW READ AND SEEK OK\r\n$");
  label("buffer");
  emit(...new Array(64).fill(0));
  for (const f of fix) {
    const value = labels[f.name] + (f.relative ? -f.at - 2 : 0x100);
    b[f.at] = value & 255;
    b[f.at + 1] = (value >> 8) & 255;
  }
  return new Uint8Array(b);
}
