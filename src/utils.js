// @flow
import execa from 'execa';

let cmd;

export const getInstallCmd = ():string => {
  if (cmd) {
    return cmd;
  }

  try {
    execa.shellSync('yarnpkg --version')
    cmd = 'yarn';
  } catch (e) {
    cmd = 'npm';
  }

  return cmd;
}