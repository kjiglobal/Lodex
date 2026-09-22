// Disposable Ubuntu CI only. Exercise the actual package validation, apt command,
// and installed-version check. CI has no desktop password agent, so its existing
// passwordless sudo authorization stands in for pkexec's interactive prompt.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const version = require('../package.json').version;
const file = path.resolve(`release/Lodex-${version}-amd64.deb`);
if (process.platform !== 'linux' || process.env.CI !== 'true') throw new Error('Run only in disposable Linux CI.');
const exported = {};
vm.runInNewContext(fs.readFileSync('dist-electron/update-installer.js', 'utf8'), {
  exports: exported, process,
  require: name => name !== 'node:child_process' ? require(name) : {
    ...childProcess,
    spawn: (command, args, options) => {
      assert.equal(command, '/usr/bin/pkexec');
      assert.equal(args[0], '--disable-internal-agent');
      assert.equal(args[1], '/usr/bin/apt-get');
      assert.equal(args.at(-1), file);
      return childProcess.spawn('/usr/bin/sudo', ['-n', ...args.slice(1)], options);
    },
  },
});
exported.installUbuntuUpdate(file, version).then(result => {
  assert.equal(result, 'installed');
  console.log('LODEX_UPDATE_INSTALL_OK package identity, apt installation, and installed version verified');
}).catch(error => { console.error(error); process.exitCode = 1; });
