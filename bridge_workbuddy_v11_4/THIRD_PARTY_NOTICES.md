# Third-party sources

## workbuddy-bridge 1.2.0

- Source: https://github.com/hanhan1223/workbuddy-bridge
- Author listed by upstream package: hanhan1223.
- License: MIT, preserved at `vendor/LICENSE`.
- Copied modules: `upstream.js`, `responses.js`, `credentials.js`, `locate.js`.
- Local changes to `credentials.js`: export the desktop reader, normalize expiry units and read optional encrypted account identity fields. No writes to the official client's auth file.
- The enhanced client uses the request normalizer and identity composition; its own stream parser preserves actual usage. Explicit output limits override the normalizer's minimum-budget behavior.
- The enhanced HTTP server replaces the copied Responses writer's placeholder usage with actual upstream usage.
- Local change to `responses.js`: preserve the caller's requested reasoning effort.

## dsh-connect-workbuddy 5.21.2

- Source: https://github.com/dingminhua/dsh-connect-workbuddy
- Inspected source commit: `893785eac560fdf5fc9e61f4d3fa264dad882eec`.
- Author: LaoDing.
- License: MIT, preserved at `vendor/LICENSE.dsh-connect-workbuddy`.
- `vendor/promo.ts` is the original promotion parser; `vendor/promo.js` was generated using Node's TypeScript type stripping. No runtime TypeScript dependency.
- Source references for the independently implemented billing and OAuth clients: `src/upstream.ts`, `src/oauth.ts` in upstream repository.

No official-client binary, real account token or user credential is included in Git.
