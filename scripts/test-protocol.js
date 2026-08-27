const assert = require("node:assert/strict");
const { parseProtocol } = require("../dist/main/protocol.js");

assert.deepEqual(parseProtocol("brickverse://guild-chat"), {
	target: "guild-chat",
	args: [],
});
assert.deepEqual(parseProtocol("brickverse://installer?product=guild-chat"), {
	target: "installer",
	args: ["guild-chat"],
});
assert.throws(() => parseProtocol("brickverse://unsupported"), /Unsupported BrickVerse route/);
console.log("Protocol checks passed.");
