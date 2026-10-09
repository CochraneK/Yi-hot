// 通过 SFTP 上传单个文件到远程服务器（腾讯云 Yi-Hot 部署用）
// 用法: SSH_PASS='xxx' node sftp-upload.js <本地文件> <远程路径>
const { Client } = require("ssh2");
const [local, remote] = [process.argv[2], process.argv[3]];
if (!local || !remote) { console.error("用法: node sftp-upload.js <本地文件> <远程路径>"); process.exit(2); }
const conn = new Client();
conn.on("ready", () => {
  conn.sftp((err, sftp) => {
    if (err) return fail("SFTP_ERR", err);
    sftp.fastPut(local, remote, (e) => {
      if (e) return fail("PUT_ERR", e);
      console.log("UPLOADED:", remote);
      conn.end();
    });
  });
}).on("error", (e) => fail("SSH_ERR", e))
.connect({
  host: process.env.SSH_HOST || "49.233.72.222",
  port: 22,
  username: process.env.SSH_USER || "ubuntu",
  password: process.env.SSH_PASS,
  readyTimeout: 30000,
});
function fail(tag, e) { console.error(tag + ":", e.message); process.exit(1); }
