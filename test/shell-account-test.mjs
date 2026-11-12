import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasAccountMenu, signOutHref } from '../shell/core.js';

test('portal account sign-out uses the portal host and display identities have no menu', () => {
  assert.equal(signOutHref({ scheme: 'https', domain: 'example.test' }), 'https://portal.example.test/outpost.goauthentik.io/sign_out');
  assert.equal(hasAccountMenu({ name: 'Display', groups: ['display'] }), false);
});
