// run-all.js
const { spawn } = require("child_process");

function runProcess(name, script) {
  const proc = spawn("node", [script], { stdio: "inherit" });

  proc.on("close", (code) => {
    console.log(`❌ ${name} stopped with code ${code}, restarting...`);
    setTimeout(() => runProcess(name, script), 2000); // auto restart
  });
}

runProcess("Smart Listener", "smart-listener-robust.js");
runProcess("Processor", "processor.js");
