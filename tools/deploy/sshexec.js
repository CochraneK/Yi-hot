// 通过密码 SSH 在远程服务器执行命令（腾讯云 Yi-Hot 部署用）
// 用法: SSH_PASS='xxx' node sshexec.js "<command>"
// 密码从环境变量 SSH_PASS 读取，不写死在文件里。
const { Client } = require("ssh2");
const cmd = process.argv.slice(2).join(" ");
if (!cmd) { console.error("用法: node sshexec.js \"<command>\""); process.exit(2); }
const conn = new Client();
conn.on("ready", () => {
  conn.exec(cmd, (err, stream) => {
    if (err) { console.error("EXEC_ERR:", err.message); process.exit(2); }
    stream.on("close", (code) => { conn.end(); process.exit(code ?? 0); });
    stream.on("data", (d) => process.stdout.write(d));
    stream.stderr.on("data", (d) => process.stderr.write(d));
  });
}).on("error", (e) => { console.error("SSH_ERR:", e.message); process.exit(1); })
.connect({
  host: process.env.SSH_HOST || "49.233.72.222",
  port: 22,
  username: process.env.SSH_USER || "ubuntu",
  password: process.env.SSH_PASS,
  readyTimeout: 30000,
});
