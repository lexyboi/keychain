const { API } = require("./keychain");

const keychain = new API();

console.log("=== Keychain Test Started ===");

keychain.new("username", "halil");
keychain.new("age", 25);
keychain.new("isAdmin", true);
keychain.new("config", { host: "localhost", port: 3306 });

console.log("Username:", keychain.get("username"));
console.log("Age:", keychain.get("age"));
console.log("isAdmin:", keychain.get("isAdmin"));
console.log("Config:", keychain.get("config"));

console.log("Has 'username'?", keychain.has("username"));
console.log("Has 'password'?", keychain.has("password"));

console.log("All keys:", keychain.list());

keychain.delete("age");
console.log("After delete 'age', has age?", keychain.has("age"));

console.log("=== Keychain Test Finished ===");
