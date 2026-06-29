const { spawn } = require('child_process');

const server = spawn('node', ['dist/main.js', 'D:\\time!shift (1)']);

server.stdout.on('data', (data) => {
  const lines = data.toString().split('\n').filter(l => l.trim());
  for (const line of lines) {
    try {
      const msg = JSON.parse(line);
      if (msg.id === 1) {
        server.stdin.write(JSON.stringify({"jsonrpc":"2.0","method":"notifications/initialized"}) + '\n');
        server.stdin.write(JSON.stringify({"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"index_directory","arguments":{"dirPath":"D:\\time!shift (1)"}}}) + '\n');
      } else if (msg.id === 2) {
        server.stdin.write(JSON.stringify({"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"query_knowledge","arguments":{"keyword":"Takemi"}}}) + '\n');
      } else if (msg.id === 3) {
        console.log("=== query_knowledge (Takemi) ===");
        console.log(msg.result.content[0].text);
        server.stdin.write(JSON.stringify({"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"get_entity","arguments":{"name":"Alight (Takemi Alight)"}}}) + '\n');
      } else if (msg.id === 4) {
        console.log("=== get_entity (Alight (Takemi Alight)) ===");
        console.log(msg.result.content[0].text);
        server.stdin.write(JSON.stringify({"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"get_entity","arguments":{"name":"Alight"}}}) + '\n');
      } else if (msg.id === 5) {
        console.log("=== get_entity (Alight) ===");
        console.log(msg.result.content[0].text);
        server.kill();
      }
    } catch (e) {}
  }
});

server.stderr.on('data', (data) => {
  // console.error(data.toString());
});

server.stdin.write(JSON.stringify({
  "jsonrpc":"2.0",
  "id":1,
  "method":"initialize",
  "params":{
    "protocolVersion":"2024-11-05",
    "capabilities":{},
    "clientInfo":{"name":"test","version":"1"}
  }
}) + '\n');
