"""Offline Android asset contract: synthetic bytes only, never private account data."""
import json
from pathlib import Path
import subprocess
import sys
import unittest

ROOT=Path(__file__).resolve().parents[1]
ASSETS=ROOT/'android/app/src/main/assets/web'

class AndroidPackageTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        subprocess.run([sys.executable,str(ROOT/'scripts/build_android.py')],check=True)

    def test_offline_mirror_exact_except_native_download(self):
        from importlib.util import spec_from_file_location, module_from_spec
        spec=spec_from_file_location('brvm_build',ROOT/'scripts/build.py')
        b=module_from_spec(spec);spec.loader.exec_module(b)
        expected=set(b.shell)-{'.nojekyll','sw.js'}
        actual={p.relative_to(ASSETS).as_posix() for p in ASSETS.rglob('*') if p.is_file()}
        self.assertEqual(expected,actual)
        for name in expected-{'app.js'}:
            self.assertEqual((ROOT/name).read_bytes(),(ASSETS/name).read_bytes(),name)
        self.assertEqual((ROOT/'icons/icon-192.png').read_bytes(),
                         (ROOT/'android/app/src/main/res/drawable-nodpi/ic_launcher.png').read_bytes())

    def test_local_origin_and_device_file_picker(self):
        source=(ROOT/'android/app/src/main/java/org/brvmfamily/app/MainActivity.java').read_text()
        self.assertIn('appassets.androidplatform.net',source)
        self.assertIn('ACTION_CREATE_DOCUMENT',source)
        self.assertIn('ACTION_OPEN_DOCUMENT',source)
        self.assertIn('MAX_EXPORT = 128L * 1024 * 1024',source)
        self.assertIn('return blocked();',source)
        self.assertIn('getAssets().open("web/" + relative)',source)
        self.assertIn('setAllowFileAccess(false)',source)
        self.assertIn('setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW)',source)
        self.assertIn('setWebContentsDebuggingEnabled(false)',source)
        self.assertNotIn('addJavascriptInterface(new FileBridge(), "BRVMAndroid");\\nwebView.loadUrl("http',source)

    def test_save_bridge_allows_exact_binary_zip_and_utf8(self):
        asset=(ASSETS/'app.js').read_text()
        begin=asset.index('  function download(value,name,mime=')
        end=asset.index('  async function exportMonthlyBackup()',begin)
        function=asset[begin:end]
        test_js=r"""
const assert=require('node:assert/strict');
const vm=require('node:vm');
const bridge={parts:[],expected:0,finished:false,
  beginSave(name,mime,size) { this.name=name;this.mime=mime;this.expected=size;return true; },
  appendChunk(part) {this.parts.push(Buffer.from(part,'base64'));return true;},
  finishSave() {this.finished=true;return Buffer.concat(this.parts).length===this.expected;},
  cancelSave() {throw Error('Unexpected cancel');}
};
const ctx={window:{BRVMAndroid:bridge},TextEncoder,Uint8Array,btoa,
  URL:{createObjectURL(){throw Error('Blob download should not run in Android');}}};
vm.runInNewContext(process.env.BRVM_DOWNLOAD_FUNCTION,ctx);
const data=new Uint8Array(80009);
for(let i=0;i<data.length;i++)data[i]=i%251;
ctx.download(data,'sauvegarde.zip','application/zip');
assert.equal(bridge.name,'sauvegarde.zip');
assert.equal(bridge.mime,'application/zip');
assert.ok(bridge.finished);
assert.deepEqual(Buffer.concat(bridge.parts),Buffer.from(data));
bridge.parts=[];bridge.finished=false;
const text='Épargne FGI — bilan privé ✓';
ctx.download(text,'test.json','application/json');
assert.equal(Buffer.concat(bridge.parts).toString('utf8'),text);
console.log('Bridge Android JSON et ZIP bit-par-bit valide.');
"""
        import os
        env={**os.environ,'BRVM_DOWNLOAD_FUNCTION':function}
        subprocess.run(['node','-e',test_js],env=env,check=True,capture_output=True,text=True)
        subprocess.run(['node','--check',str(ASSETS/'app.js')],check=True,capture_output=True)

    def test_no_private_data_or_external_web_shell(self):
        src=(ASSETS/'app.js').read_text()
        self.assertIn('!window.BRVMAndroid',src)
        self.assertIn('window.BRVMAndroid.beginSave',src)
        self.assertNotIn('https://applicreation0-web.github.io',src)
        self.assertEqual(json.loads((ASSETS/'market/feed.json').read_text()),{'enabled':False})
        self.assertFalse((ASSETS/'sw.js').exists())
        manifest=(ROOT/'android/app/src/main/AndroidManifest.xml').read_text()
        self.assertIn('allowBackup="false"',manifest)
        self.assertIn('usesCleartextTraffic="false"',manifest)

if __name__=='__main__':unittest.main()
