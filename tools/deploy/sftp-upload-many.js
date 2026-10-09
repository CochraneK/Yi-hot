// 批量 SFTP 上传：清单文件每行 "本地绝对路径|远程绝对路径"
// 用法: SSH_PASS='xxx' node sftp-upload-many.js <本地清单文件>
const { Client } = require("ssh2");
const fs = require("fs");
const manifest = process.argv[2];
if (!manifest) { console.error("用法: node sftp-upload-many.js <manifest>"); process.exit(2); }
const lines = fs.readFileSync(manifest, "utf8").split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
const conn = new Client();
conn.on("ready", () => {
  conn.sftp(async (err, sftp) => {
    if (err) return fail("SFTP_ERR", err);
    let ok = 0;
    for (const ln of lines) {
      const i = ln.indexOf("|");
      const local = ln.slice(0, i), remote = ln.slice(i + 1);
      try {
        await new Promise((res, rej) => sftp.fastPut(local, remote, (e) => (e ? rej(e) : res())));
      } catch (e) {
        console.error("PUT_ERR", remote, e.message);
        process.exit(1);
      }
      ok++;
      console.log("UPLOADED:", remote);
    }
    console.log("DONE", ok, "files");
    conn.end();
  });
}).on("error", (e) => fail("SSH_ERR", e)).connect({
  host: process.env.SSH_HOST || "49.233.72.222",
  port: 22,
  username: process.env.SSH_USER || "ubuntu",
  password: process.env.SSH_PASS,
  readyTimeout: 30000,
});
function fail(tag, e) { console.error(tag + ":", e.message); process.exit(1); }
