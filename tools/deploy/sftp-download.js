// 通过 SFTP 从远程服务器下载单个文件（腾讯云 Yi-Hot 运维用）
// 用法: SSH_PASS='xxx' node sftp-download.js <远程路径> <本地路径>
const { Client } = require("ssh2");
const [remote, local] = [process.argv[2], process.argv[3]];
if (!remote || !local) { console.error("用法: node sftp-download.js <远程路径> <本地路径>"); process.exit(2); }
const conn = new Client();
conn.on("ready", () => {
  conn.sftp((err, sftp) => {
    if (err) return fail("SFTP_ERR", err);
    sftp.fastGet(remote, local, (e) => {
      if (e) return fail("GET_ERR", e);
      console.log("DOWNLOADED:", remote, "->", local);
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
