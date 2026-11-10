// CC0-1.0 public DOS fixture. No commercial code or data.
export function tempSaveProgram() {
  const code = [],
    labels = {},
    fix = [];
  const emit = (...v) => code.push(...v),
    word = (n) => emit(n & 255, (n >> 8) & 255),
    mark = (n) => (labels[n] = code.length);
  const ptr = (n) => {
    fix.push([code.length, n, false]);
    word(0);
  };
  const jump = (op, n) => {
    emit(...op);
    fix.push([code.length, n, true]);
    word(0);
  };
  const print = (n) => {
    emit(0xba);
    ptr(n);
    emit(0xb4, 9, 0xcd, 0x21);
  };
  const string = (n, s) => {
    mark(n);
    emit(...new TextEncoder().encode(s));
  };
  emit(0xba);
  ptr("dir");
  emit(0xb4, 0x39, 0xcd, 0x21); // mkdir; existing directory is OK
  print("banner");
  mark("loop");
  emit(0x30, 0xe4, 0xcd, 0x16, 0x0c, 0x20);
  for (const [key, label] of [
    ["a", "a"],
    ["b", "b"],
    ["c", "consume"],
    ["s", "manual"],
    ["q", "quit"],
  ]) {
    emit(0x3c, key.charCodeAt(0));
    jump([0x0f, 0x84], label);
  }
  jump([0xe9], "loop");
  for (const [label, name, payload, message] of [
    ["a", "temp", "payloadA", "madeA"],
    ["b", "temp", "payloadB", "madeB"],
    ["manual", "save", "payloadS", "madeS"],
  ]) {
    mark(label);
    emit(0xba);
    ptr(name);
    emit(0x31, 0xc9, 0xb4, 0x3c, 0xcd, 0x21);
    jump([0x0f, 0x82], "error");
    emit(0x89, 0xc3, 0xba);
    ptr(payload);
    emit(0xb9, 6, 0, 0xb4, 0x40, 0xcd, 0x21);
    jump([0x0f, 0x82], "error");
    emit(0xb4, 0x3e, 0xcd, 0x21);
    print(message);
    jump([0xe9], "loop");
  }
  mark("consume");
  emit(0xba);
  ptr("temp");
  emit(0xb8, 0, 0x3d, 0xcd, 0x21);
  jump([0x0f, 0x82], "missing");
  emit(0x89, 0xc3, 0xba);
  ptr("buffer");
  emit(0xb9, 6, 0, 0xb4, 0x3f, 0xcd, 0x21);
  jump([0x0f, 0x82], "error");
  emit(0xb4, 0x3e, 0xcd, 0x21);
  print("loaded");
  emit(0xbb, 1, 0, 0xba);
  ptr("buffer");
  emit(0xb9, 6, 0, 0xb4, 0x40, 0xcd, 0x21);
  emit(0xba);
  ptr("temp");
  emit(0xb4, 0x41, 0xcd, 0x21);
  jump([0x0f, 0x82], "error");
  print("consumed");
  jump([0xe9], "loop");
  mark("missing");
  print("none");
  jump([0xe9], "loop");
  mark("error");
  print("err");
  jump([0xe9], "loop");
  mark("quit");
  emit(0xb8, 0, 0x4c, 0xcd, 0x21);
  for (const [n, s] of Object.entries({
    dir: "SAVE\0",
    temp: "SAVE\\ED4_S99_.DAT\0",
    save: "SAVE\\MANUAL.DAT\0",
    payloadA: "TEMP_A",
    payloadB: "TEMP_B",
    payloadS: "MANUAL",
    banner:
      "J TEMP READY [A/B] create [C] read/delete [S] manual [Q] quit\r\n$",
    madeA: "TEMP A CREATED\r\n$",
    madeB: "TEMP B CREATED\r\n$",
    madeS: "MANUAL SAVED\r\n$",
    loaded: "LOADED $",
    consumed: " CONSUMED\r\n$",
    none: "NO TEMP FILE\r\n$",
    err: "PUBLIC FILE ERROR\r\n$",
  }))
    string(n, s);
  mark("buffer");
  emit(0, 0, 0, 0, 0, 0);
  for (const [at, name, relative] of fix) {
    const n = labels[name] + (relative ? -at - 2 : 0x100);
    code[at] = n & 255;
    code[at + 1] = (n >> 8) & 255;
  }
  return new Uint8Array(code);
}
