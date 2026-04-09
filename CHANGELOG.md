# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).


## [0.19.0](https://github.com/shawnphoffman/shared-contacts/compare/v0.18.2...v0.19.0) (2026-04-09)

### Features

* **docker:** add built-in HEALTHCHECK to Docker image ([8335f86](https://github.com/shawnphoffman/shared-contacts/commit/8335f863907b856ca901927f767d3521ff32d7b1))
* **ui:** convert top navbar to responsive sidebar ([f6bde9f](https://github.com/shawnphoffman/shared-contacts/commit/f6bde9f2f1783339b8b973af1e8dc6dc9939c571))

### Bug Fixes

* **ui:** show support dialog only on click and add GitHub link to about page ([f90c4bf](https://github.com/shawnphoffman/shared-contacts/commit/f90c4bfc85325b0da3adca6e2ab637195a14eef8))

### Changelog

All notable changes to this project will be documented in this file. Dates are displayed in UTC.

#### [v0.19.0](https://github.com/shawnphoffman/shared-contacts/compare/v0.18.2...v0.19.0)

- ✨ Feature(ui): convert top navbar to responsive sidebar [`f6bde9f`](https://github.com/shawnphoffman/shared-contacts/commit/f6bde9f2f1783339b8b973af1e8dc6dc9939c571)
- 🐛 Fix(ui): show support dialog only on click and add GitHub link to about page [`f90c4bf`](https://github.com/shawnphoffman/shared-contacts/commit/f90c4bfc85325b0da3adca6e2ab637195a14eef8)
- 🔧 Chore: release v0.18.3 [`627bca3`](https://github.com/shawnphoffman/shared-contacts/commit/627bca39ff8c40548e17a1d5e1ff458f06a43eeb)
- ✨ Feature(docker): add built-in HEALTHCHECK to Docker image [`8335f86`](https://github.com/shawnphoffman/shared-contacts/commit/8335f863907b856ca901927f767d3521ff32d7b1)

#### [v0.18.2](https://github.com/shawnphoffman/shared-contacts/compare/v0.18.1...v0.18.2)

> 9 April 2026

- 👷 CI(ci): bump GitHub Actions to Node.js 24 compatible versions [`98e0cc5`](https://github.com/shawnphoffman/shared-contacts/commit/98e0cc54f8154f8ba1f7d43e14071565e6e483c7)
- 🔧 Chore: release v0.18.2 [`fc72f3f`](https://github.com/shawnphoffman/shared-contacts/commit/fc72f3f9e163c2ad0c340925bdff87a8f4fa357e)
- 👷 CI(ci): skip CI pipeline for docs-only and non-code changes [`0f5aa6f`](https://github.com/shawnphoffman/shared-contacts/commit/0f5aa6f1897088de6fc03d39dc1eca98817af508)
- 🐛 Fix(docker): set NODE_ENV before sync-service and resolve duplicate mount point [`b9f458f`](https://github.com/shawnphoffman/shared-contacts/commit/b9f458fe074df31540fcd574c11063ee1d12c3a0)
- 📝 Docs: disclose AI usage level [`c972106`](https://github.com/shawnphoffman/shared-contacts/commit/c972106666c79b4d54cdadf12ea0bd91545dbd93)
- 🐛 Fix(ci): build Docker image locally for smoke test [`0ba91c4`](https://github.com/shawnphoffman/shared-contacts/commit/0ba91c449e2e80ba36e0ad1d774ca3eefb9fdfe6)
- 🐛 Fix(sync-service): add missing 15_soft_delete migration to runner [`ef8a23e`](https://github.com/shawnphoffman/shared-contacts/commit/ef8a23ecf56551d07ce64564370ef7aff5e94e40)

#### [v0.18.1](https://github.com/shawnphoffman/shared-contacts/compare/v0.18.0...v0.18.1)

> 9 April 2026

- 👷 CI(ci): add docker build to release workflow [`17b765d`](https://github.com/shawnphoffman/shared-contacts/commit/17b765d3d537af98aaf4ebb2a0ebf7ba58afecbf)
- 🔧 Chore: release v0.18.1 [`72717d2`](https://github.com/shawnphoffman/shared-contacts/commit/72717d21024ee5512714a308433df7b1ea753df6)

#### [v0.18.0](https://github.com/shawnphoffman/shared-contacts/compare/v0.17.0...v0.18.0)

> 9 April 2026

- 🐛 Fix(deps): regenerate root package-lock.json with lockfileversion 3 [`82351e6`](https://github.com/shawnphoffman/shared-contacts/commit/82351e61b8e0e54912f6ab101323d8190e04d350)
- 📦 Build: add commitlint and husky for conventional commit enforcement [`cda43b0`](https://github.com/shawnphoffman/shared-contacts/commit/cda43b043fca8ee205ae62308a91fd7900f5486b)
- ♻️ Refactor(sync): split sync.ts into focused modules [`36cf804`](https://github.com/shawnphoffman/shared-contacts/commit/36cf804ca02e1b15badcbee9eaf08bc458315ece)
- 📦 Build: add vitest test infrastructure to sync-service and ui [`15b140d`](https://github.com/shawnphoffman/shared-contacts/commit/15b140db84028621e860da94fdb166c16ff27e6f)
- ♻️ Refactor(ui): extract contact form sub-components [`20f26cb`](https://github.com/shawnphoffman/shared-contacts/commit/20f26cbc0d79207681ca5284e7e91a97b9ae3ee3)
- ✨ Feature(ui): add zod validation schemas for api endpoints [`f5408af`](https://github.com/shawnphoffman/shared-contacts/commit/f5408afee0319086e0245388420bb3ca63c70951)
- 🔧 Chore: release v0.18.0 [`a1190a0`](https://github.com/shawnphoffman/shared-contacts/commit/a1190a0877c3e953d97ef4acff42ff5a7f32d717)
- ✨ Feature(sync): add structured logging with pino to sync-service [`39ed258`](https://github.com/shawnphoffman/shared-contacts/commit/39ed258358fdb2286441035a717f826c2005661d)
- ♻️ Refactor(ui): extract csv parsing and export into shared lib [`b7b533e`](https://github.com/shawnphoffman/shared-contacts/commit/b7b533e58c65082ab4c870388b553a5830bf2686)
- ✅ Test(sync): write sync pipeline integration tests [`e1b4521`](https://github.com/shawnphoffman/shared-contacts/commit/e1b4521499d43a4be925e0d73f6d92fa76607573)
- ✅ Test(vcard): add comprehensive unit tests for vcard parsing and generation [`c5aee7e`](https://github.com/shawnphoffman/shared-contacts/commit/c5aee7efec2de88e6ef36aab0e83d8f7f4f7d00e)
- ✅ Test(ui): add api endpoint handler tests [`dd74384`](https://github.com/shawnphoffman/shared-contacts/commit/dd743848b959c755170278a9fca296d6af53d220)
- ✅ Test(ui): add unit tests for contact merge and deduplication logic [`7a559fd`](https://github.com/shawnphoffman/shared-contacts/commit/7a559fd8c21309a2bddc4790459242c4f7898010)
- ✅ Test(ui): add unit tests for zod validation schemas [`c473465`](https://github.com/shawnphoffman/shared-contacts/commit/c473465aebeb37b32e2928cdb983178880a8de3f)
- ✨ Feature(ui): add structured logging with pino to ui server routes [`8e89620`](https://github.com/shawnphoffman/shared-contacts/commit/8e89620623fb87c48b173c7ed794c127e87638e9)
- ✅ Test(ui): add csv import and export edge case tests [`61d6db4`](https://github.com/shawnphoffman/shared-contacts/commit/61d6db471d72ecb69037e71d408d6f34d51fbe24)
- 🐛 Fix(auth): add file locking and atomic writes to htpasswd operations [`882291c`](https://github.com/shawnphoffman/shared-contacts/commit/882291c9de453332c6e01a83dda96e3674a7332e)
- ✅ Test(sync): add unit tests for sync module functions [`7bef8e8`](https://github.com/shawnphoffman/shared-contacts/commit/7bef8e831d2ee564d085c82023da809d6f46b06a)
- ✨ Feature(ui): add trash view for soft-deleted contacts [`fcff4c1`](https://github.com/shawnphoffman/shared-contacts/commit/fcff4c12ac0f26c02e4a8afb43239a85e1413c24)
- ♻️ Refactor(db): extract parsecontactrow helper to eliminate jsonb parsing duplication [`49975c6`](https://github.com/shawnphoffman/shared-contacts/commit/49975c6350ee5d238ac2c77ceafac66700a06cf0)
- 🐛 Fix(ui): resolve eslint errors in ui package [`85f9a9d`](https://github.com/shawnphoffman/shared-contacts/commit/85f9a9d844486cc67203e915abae74afff175ace)
- ✨ Feature(db): add soft delete with deleted_at column and trash api [`d95574c`](https://github.com/shawnphoffman/shared-contacts/commit/d95574c3c70c063353bb0d21aaf37cdffb50bea0)
- ✨ Feature(ui): add support the trail dialog with header icon [`a12ef08`](https://github.com/shawnphoffman/shared-contacts/commit/a12ef08ec22d1f4ce18c354edbb28fcb38e94aeb)
- ✨ Feature(ui): add contact export endpoint for csv and vcard [`11a5d02`](https://github.com/shawnphoffman/shared-contacts/commit/11a5d02a7e44f4d0ea47aadf12c5586974f101ba)
- ⚡ Performance(db): batch n+1 queries in bulk-books and merge endpoints [`1d844b9`](https://github.com/shawnphoffman/shared-contacts/commit/1d844b948495baed3869da0b947b7210361f9216)
- 👷 CI: add test workflow and docker smoke test [`6a69032`](https://github.com/shawnphoffman/shared-contacts/commit/6a6903211c0242b6f55cbd84251f26693fa1734c)
- ✨ Feature(ui): add skeleton loading states and error boundaries [`f59914d`](https://github.com/shawnphoffman/shared-contacts/commit/f59914d817a17ec1a83b870e0cb2f073838a81a5)
- 🐛 Fix(ui): fix type errors and regenerate route tree [`5c0d4f6`](https://github.com/shawnphoffman/shared-contacts/commit/5c0d4f6221722358bed7de277ad75fdfafdcb44d)
- ✨ Feature(ui): add support links to about page [`70175e4`](https://github.com/shawnphoffman/shared-contacts/commit/70175e47e9938ccfae25005bb9aef43194239558)
- ✅ Test(db): add unit tests for parsecontactrow jsonb helper [`9dbf801`](https://github.com/shawnphoffman/shared-contacts/commit/9dbf8018680dd85e5fbfe4dd52a861031e07c288)
- 🐛 Fix(ui): add error handling to photo and runtime-config endpoints [`a584baa`](https://github.com/shawnphoffman/shared-contacts/commit/a584baa5d7806e6c331e14089852bc68d2ea5359)
- ✅ Test(docker): add integration test infrastructure [`cd0e682`](https://github.com/shawnphoffman/shared-contacts/commit/cd0e682843e78de8bcdeedf75a44db24b49008e3)
- ⚡ Performance(db): cache information_schema and table existence lookups [`e324031`](https://github.com/shawnphoffman/shared-contacts/commit/e324031b535a06506908c952b5e9f193f0007ac9)
- 🐛 Fix(sync): add atomic file write utility to prevent corruption on crash [`4543fdc`](https://github.com/shawnphoffman/shared-contacts/commit/4543fdcebd1680c70239cccc988e4c78204d4d0e)
- 👷 CI(ci): add automated release workflow [`43c9def`](https://github.com/shawnphoffman/shared-contacts/commit/43c9def8d3f6d9366e9b5d0536ae6bfe93e76e89)
- ✨ Feature(db): add pagination support to contacts api [`a663450`](https://github.com/shawnphoffman/shared-contacts/commit/a6634501ec9133c2d7580f1fbf7c673619c9e980)
- 📝 Docs: update .env.example with all environment variables [`a0ff7d9`](https://github.com/shawnphoffman/shared-contacts/commit/a0ff7d92cc63b7870a5cb3de856ef6737e9bdfe2)
- 🐛 Fix(db): wrap migration execution in transactions for atomicity [`071940a`](https://github.com/shawnphoffman/shared-contacts/commit/071940ae735897b1ea403f4c769e3c7c823ae24b)
- 🐛 Fix(sync): prevent concurrent sync overlap with guard flags [`3cc6b37`](https://github.com/shawnphoffman/shared-contacts/commit/3cc6b370c8e5b39169ec368eccbd7e68e2fcebb6)
- ✨ Feature(ui): add request body size limits for api routes [`abb71a2`](https://github.com/shawnphoffman/shared-contacts/commit/abb71a2274e152e37dd78ff5b28728c9a9bfb05a)
- 📦 Build(docker): fix npm ci, remove default passwords, add node_env, add non-root user [`bcb3165`](https://github.com/shawnphoffman/shared-contacts/commit/bcb3165bf96131bd1fe26c46c7aee10394617701)
- 👷 CI(ci): gate release workflow on successful tests [`eade235`](https://github.com/shawnphoffman/shared-contacts/commit/eade23549911664f5336537f5f7a3f34fc79274c)
- ✨ Feature(ui): add export buttons to contacts list [`1a8c296`](https://github.com/shawnphoffman/shared-contacts/commit/1a8c2965fcaf36a351e7606eecac86f73cd091be)
- 🔧 Chore: add agpl-3.0 license to package.json files, readme badge, and docker labels [`355dfaa`](https://github.com/shawnphoffman/shared-contacts/commit/355dfaa4635b481331a0239b825b9c80eeb1ddb0)
- 🐛 Fix(ci): create .env before docker compose build in smoke test [`b66e4e6`](https://github.com/shawnphoffman/shared-contacts/commit/b66e4e6873dd0ce922f9f2160b11ad91ce6c6ef5)
- 🐛 Fix(docker): revert non-root user, add todo for proper implementation [`86bd045`](https://github.com/shawnphoffman/shared-contacts/commit/86bd045c584332bb48a7246c71fc33e51fc1dd2b)
- 👷 CI: add linting step to test workflow [`3fd9aed`](https://github.com/shawnphoffman/shared-contacts/commit/3fd9aed340d7653e8ff05fc3903c4ddebdd109a2)
- 🐛 Fix(docker): add radicale health check to dev compose [`7c1d728`](https://github.com/shawnphoffman/shared-contacts/commit/7c1d728d4af2ff4fc0566448b243276cbcc5b2dc)
- 🔧 Chore: gate releases on passing tests with release-it [`8b72298`](https://github.com/shawnphoffman/shared-contacts/commit/8b72298c9f7786d233a47151b5d0a68634d40980)
- 📦 Build(docker): prune dev dependencies from production image [`b91712b`](https://github.com/shawnphoffman/shared-contacts/commit/b91712bb4eafe2112ed8f62be1a9919bf65bc0f8)
- 🔧 Chore: gitignore claude code local settings [`26db44e`](https://github.com/shawnphoffman/shared-contacts/commit/26db44e61652146084f222d260a5d4d0723c88a3)
- 🔧 Chore: ignore local analysis notes [`5d6a1ca`](https://github.com/shawnphoffman/shared-contacts/commit/5d6a1ca5765e5380f3b0c406da59655ddddf1f7e)
- 🐛 Fix: use docker exec for smoke test health check [`3215dc3`](https://github.com/shawnphoffman/shared-contacts/commit/3215dc33f0d34829e6ffe30bc91fda89c19d0736)
- 📦 Build: enable github releases with auto-generated notes in release-it [`9ef4300`](https://github.com/shawnphoffman/shared-contacts/commit/9ef4300e896d20eddb2a03846b02af073b84b9b2)
- 🐛 Fix(sync): resolve lint errors breaking CI [`935d48b`](https://github.com/shawnphoffman/shared-contacts/commit/935d48b737d9ca008ad09a2afa7e9fd7fca1625d)
- 🐛 Fix(ci): run unit tests only in release-it hook [`870ed2c`](https://github.com/shawnphoffman/shared-contacts/commit/870ed2c3bd64edebacfce103fb9417b89d9cb2be)
- ✨ Feature(sync): add request body size limits to sync-service api [`d1352e9`](https://github.com/shawnphoffman/shared-contacts/commit/d1352e99a238edfc2ab522c6189445ac252f1aba)
- 🐛 Fix: quote commit-msg hook argument to handle paths with spaces [`fa1ed19`](https://github.com/shawnphoffman/shared-contacts/commit/fa1ed194e6a3cbb4586740bd17cb0501e20a063b)
- 📦 Build: allow ui tests to pass with no test files [`88610fb`](https://github.com/shawnphoffman/shared-contacts/commit/88610fb5da880343b60cb58c45c9ab3a3d861609)

#### [v0.17.0](https://github.com/shawnphoffman/shared-contacts/compare/v0.16.0...v0.17.0)

> 28 January 2026

- ✨ Feature: add mobileconfig profile generation and download functionality in CardDAVConnectionPage [`7a31c90`](https://github.com/shawnphoffman/shared-contacts/commit/7a31c90335faaf9b0789374da997542799de3c38)
- 🔧 Chore: release v0.17.0 [`2f073dd`](https://github.com/shawnphoffman/shared-contacts/commit/2f073dd55ff96168922377c08cfadb4ec0559b36)

#### [v0.16.0](https://github.com/shawnphoffman/shared-contacts/compare/v0.15.0...v0.16.0)

> 28 January 2026

- ✨ Feature: add runtime configuration fetching and update CardDAV base URL logic in CardDAVConnectionPage [`a448f5f`](https://github.com/shawnphoffman/shared-contacts/commit/a448f5fe2cdac69cafc2250aa283ba99afc6093b)
- ✨ Feature: enhance readiness check and error handling during startup in sync service [`d53d9fc`](https://github.com/shawnphoffman/shared-contacts/commit/d53d9fc047cfde131a5be834d301e4eaea7fc00d)
- ✨ Feature: implement graceful shutdown handling in sync service to ensure proper resource cleanup on termination signals [`0581b92`](https://github.com/shawnphoffman/shared-contacts/commit/0581b92520ef1a451968456ee7cbab4be39785d9)
- 🔧 Chore: release v0.16.0 [`84b00f0`](https://github.com/shawnphoffman/shared-contacts/commit/84b00f0361d10707e68353e67ec5683ad2a97f50)

#### [v0.15.0](https://github.com/shawnphoffman/shared-contacts/compare/v0.14.0...v0.15.0)

> 26 January 2026

- 🐛 Fix: clarify CardDAV connection instructions and improve UI for displaying URLs in CardDAVConnectionPage [`740f982`](https://github.com/shawnphoffman/shared-contacts/commit/740f982d7dbf9966d49030c12ed42c891fc92423)
- ✨ Feature: add password visibility toggle and auto-generate slug functionality in BooksPage [`9f9d1e7`](https://github.com/shawnphoffman/shared-contacts/commit/9f9d1e791aa7cbf55e0241ab93b1845ecaa3bd04)
- ✨ Feature: enhance password input UI with improved layout and visibility toggle in BookCard component [`bbb0c05`](https://github.com/shawnphoffman/shared-contacts/commit/bbb0c0581ba29ce12ed9a181ca9b6fe21377c954)
- ✨ Feature: add optional public URLs for CardDAV connection in environment configuration and update connection logic in UI [`8da8a34`](https://github.com/shawnphoffman/shared-contacts/commit/8da8a3469e9aae943b5edd7887cc908418b79fbf)
- 🔧 Chore: release v0.15.0 [`3aac943`](https://github.com/shawnphoffman/shared-contacts/commit/3aac94369e5a6fbc5b717e524ddb57bb4c556fe1)
- ♻️ Refactor: streamline JSX structure in RadicaleUsersPage and enhance dialog title with selected user context [`9f1d0ac`](https://github.com/shawnphoffman/shared-contacts/commit/9f1d0ace1a1233f0ccd07ba24201feb127bfb9e5)

#### [v0.14.0](https://github.com/shawnphoffman/shared-contacts/compare/v0.13.2...v0.14.0)

> 26 January 2026

- ✨ Feature: implement cleanup of old nested directories for users without access to certain books, enhancing user access management [`6151ae3`](https://github.com/shawnphoffman/shared-contacts/commit/6151ae36e39f19ca397b1837958af95de2e1322a)
- 🔧 Chore: release v0.14.0 [`4e4d00d`](https://github.com/shawnphoffman/shared-contacts/commit/4e4d00d9535271f17c4cf3589b32f068640c807d)

#### [v0.13.2](https://github.com/shawnphoffman/shared-contacts/compare/v0.13.1...v0.13.2)

> 26 January 2026

- 🔧 Chore: update package-lock.json to version 0.110.0 for multiple dependencies, including oxc-minify and oxc-transform, and upgrade various packages such as pg and prettier [`9044540`](https://github.com/shawnphoffman/shared-contacts/commit/904454032a7f04ebcf2707fd6f1dc02382ac75e0)
- 🔧 Chore: release v0.13.2 [`de89950`](https://github.com/shawnphoffman/shared-contacts/commit/de89950f4d0e138b994a3663a171d9a1ded5b0f4)

#### [v0.13.1](https://github.com/shawnphoffman/shared-contacts/compare/v0.13.0...v0.13.1)

> 26 January 2026

- 🔧 Chore: remove test scripts from package.json (for now) and update README to reflect changes in testing instructions [`3eb5750`](https://github.com/shawnphoffman/shared-contacts/commit/3eb57509b105c57f5db8e82cf6de271ec71fae5a)
- 🔧 Chore: update .gitignore and dockerignore to include test-logs; remove unused CardDAV test scripts [`04e73b8`](https://github.com/shawnphoffman/shared-contacts/commit/04e73b8abe4b71b83398521dc024cb1e6bf56076)
- 🔧 Chore: release v0.13.1 [`807b78a`](https://github.com/shawnphoffman/shared-contacts/commit/807b78ae5029764c615d7fc213b6ca046a825a09)

#### [v0.13.0](https://github.com/shawnphoffman/shared-contacts/compare/v0.12.0...v0.13.0)

> 25 January 2026

- ✨ Feature: add user-book-assignments API endpoint and integrate it into CardDAV connection page; enhance user filtering logic [`32a5a00`](https://github.com/shawnphoffman/shared-contacts/commit/32a5a00cbeacea46e7d8bf85ae238d9d31b4e492)
- 🔧 Chore: release v0.13.0 [`a47c9bd`](https://github.com/shawnphoffman/shared-contacts/commit/a47c9bdfde93655aa0b49fd86d016616f52eb014)

#### [v0.12.0](https://github.com/shawnphoffman/shared-contacts/compare/v0.11.1...v0.12.0)

> 25 January 2026

- ✨ Feature: enhance composite user management by adding error handling and ensuring all composite users exist on startup [`70764f0`](https://github.com/shawnphoffman/shared-contacts/commit/70764f0b75b4fbcf355ee7583f6b938bc719fa51)
- 🔧 Chore: release v0.12.0 [`c1367c0`](https://github.com/shawnphoffman/shared-contacts/commit/c1367c0c55540e9ddf046af268c9ec18e1a069cd)

#### [v0.11.1](https://github.com/shawnphoffman/shared-contacts/compare/v0.11.0...v0.11.1)

> 25 January 2026

- 🔧 Chore: release v0.11.1 [`92f2621`](https://github.com/shawnphoffman/shared-contacts/commit/92f2621dd713495f4af3633bcad5652773bd7924)
- 🐛 Fix: update function to retrieve explicit address book IDs for user in setUserAddressBooks [`3a6f2d9`](https://github.com/shawnphoffman/shared-contacts/commit/3a6f2d9e517aa9a761cd42bcfb6a9ca879706b97)

#### [v0.11.0](https://github.com/shawnphoffman/shared-contacts/compare/v0.10.0...v0.11.0)

> 25 January 2026

- ✨ Feature: implement composite usernames for CardDAV accounts, allowing multiple address books per user; update sync logic and UI instructions accordingly [`afd1467`](https://github.com/shawnphoffman/shared-contacts/commit/afd14679d6dc5a7a47fc629b070541a0efb58247)
- 🔧 Chore: release v0.11.0 [`f9797c7`](https://github.com/shawnphoffman/shared-contacts/commit/f9797c7a2960c3cb5dd17ec32adf00dc6859987e)

#### [v0.10.0](https://github.com/shawnphoffman/shared-contacts/compare/v0.9.1...v0.10.0)

> 25 January 2026

- ✨ Feature: implement principal properties management for users to ensure display names in CardDAV collections [`173de60`](https://github.com/shawnphoffman/shared-contacts/commit/173de60d159138345ef77013c7678c620ef18079)
- 🔧 Chore: release v0.10.0 [`da9238b`](https://github.com/shawnphoffman/shared-contacts/commit/da9238b40c976d6469da20903ff4199754493c9d)

#### [v0.9.1](https://github.com/shawnphoffman/shared-contacts/compare/v0.9.0...v0.9.1)

> 25 January 2026

- 🐛 Fix: improve error handling and formatting in sync service; update CardDAV connection instructions for clarity [`c9cf78e`](https://github.com/shawnphoffman/shared-contacts/commit/c9cf78ea078d5869495abde9665badc222b97cbb)
- 🔧 Chore: release v0.9.1 [`0b78d7d`](https://github.com/shawnphoffman/shared-contacts/commit/0b78d7d3f0ab18133e76b983f60e00913bc7e814)

#### [v0.9.0](https://github.com/shawnphoffman/shared-contacts/compare/v0.8.1...v0.9.0)

> 25 January 2026

- ✨ Feature: update rights configuration for root access and enhance CardDAV connection instructions in UI [`07c70ac`](https://github.com/shawnphoffman/shared-contacts/commit/07c70acd3c8fd31b7091804e11f63ae70f8d0c03)
- 🔧 Chore: release v0.9.0 [`08c64bf`](https://github.com/shawnphoffman/shared-contacts/commit/08c64bf89ddd222a9a154d6694543b839c3f8d18)

#### [v0.8.1](https://github.com/shawnphoffman/shared-contacts/compare/v0.8.0...v0.8.1)

> 25 January 2026

- 🔧 Chore: release v0.8.1 [`0a3cd0c`](https://github.com/shawnphoffman/shared-contacts/commit/0a3cd0ca8328defd41859578e12937b99b112c2c)
- 🐛 Fix: tweak heading to trigger version [`e7c6a27`](https://github.com/shawnphoffman/shared-contacts/commit/e7c6a27901b8d840a9cd1234e231b7e334c1c927)

#### [v0.8.0](https://github.com/shawnphoffman/shared-contacts/compare/v0.7.0...v0.8.0)

> 25 January 2026

- ✨ Feature: enhance address book functionality with read-only subscription support and bulk management features [`25909e2`](https://github.com/shawnphoffman/shared-contacts/commit/25909e2afe4489b25fb01af5d395accb475b8138)
- ✨ Feature: add bulk address book management functionality with dialog for adding/removing contacts [`f3c17c8`](https://github.com/shawnphoffman/shared-contacts/commit/f3c17c8c8e06957dee3b58c57de66910e30b6bdb)
- ♻️ Refactor: adjust layout and spacing in ContactForm and ContactDetailPage for improved UI consistency [`cc5572a`](https://github.com/shawnphoffman/shared-contacts/commit/cc5572a61678374934263600e885371ca830f731)
- 🔧 Chore: release v0.8.0 [`e346e4a`](https://github.com/shawnphoffman/shared-contacts/commit/e346e4a55aec584afa1dde61a1a1782dd1cee00a)

#### [v0.7.0](https://github.com/shawnphoffman/shared-contacts/compare/v0.6.4...v0.7.0)

> 21 January 2026

- ✨ Feature: implement address book management with CRUD operations and integrate into contact forms and user management [`9de1cf9`](https://github.com/shawnphoffman/shared-contacts/commit/9de1cf94efa9be9afa7feb3133d1bf96ccf6ed90)
- 🔧 Chore: release v0.7.0 [`9202f07`](https://github.com/shawnphoffman/shared-contacts/commit/9202f074a2c40334c64338ffd5595c5268f29879)

#### [v0.6.4](https://github.com/shawnphoffman/shared-contacts/compare/v0.6.3...v0.6.4)

> 16 January 2026

- 🐛 Fix: enhance contact synchronization logic to handle duplicate vCard IDs and improve error handling during contact creation [`ea08fc0`](https://github.com/shawnphoffman/shared-contacts/commit/ea08fc0d9846596cfa628df1f30c6ac8c3a33d8b)
- 🔧 Chore: release v0.6.4 [`0744982`](https://github.com/shawnphoffman/shared-contacts/commit/0744982954eda7cf1d25c899961e44f70b05bae9)

#### [v0.6.3](https://github.com/shawnphoffman/shared-contacts/compare/v0.6.2...v0.6.3)

> 16 January 2026

- ♻️ Refactor: replace pnpm with npm in various files for consistency and update CardDAV connection documentation with direct and proxy URL options [`c9c0695`](https://github.com/shawnphoffman/shared-contacts/commit/c9c0695203d2d2b111cee1d593891d9cba6d38c3)
- ♻️ Refactor: update text sizes in various components for improved readability and consistency [`92f20e4`](https://github.com/shawnphoffman/shared-contacts/commit/92f20e4ec93e477d6d35b6ba86b4c00b834f7d50)
- 🔧 Chore: release v0.6.3 [`c211695`](https://github.com/shawnphoffman/shared-contacts/commit/c2116959ffeda35a76b84c67d368e8a70011b11c)

#### [v0.6.2](https://github.com/shawnphoffman/shared-contacts/compare/v0.6.1...v0.6.2)

> 16 January 2026

- 🔧 Chore: comment out ports and Traefik labels in docker-compose.prod.yml for cleaner configuration and future reference [`185fe73`](https://github.com/shawnphoffman/shared-contacts/commit/185fe733c551edbba916b5e0205dd006c14eb326)
- 🔧 Chore: release v0.6.2 [`42157fe`](https://github.com/shawnphoffman/shared-contacts/commit/42157fe1e6031bd017c82d978583bf8a95906fb7)
- 🔧 Chore: add SYNC_INTERVAL environment variable to docker-compose.prod.yml for configurable sync timing [`56e54e3`](https://github.com/shawnphoffman/shared-contacts/commit/56e54e31d0ddf0498ca4ccddf57f47c04b4b5a6c)

#### [v0.6.1](https://github.com/shawnphoffman/shared-contacts/compare/v0.6.0...v0.6.1)

> 16 January 2026

- ♻️ Refactor: replace pnpm with npm in Dockerfiles for consistency and simplify dependency installation [`f938ccb`](https://github.com/shawnphoffman/shared-contacts/commit/f938ccb5d7abccea9eff821432e8a18ad7534851)
- 🔧 Chore: release v0.6.1 [`3fa4cc7`](https://github.com/shawnphoffman/shared-contacts/commit/3fa4cc79040591bfce10ad6fdb96d714db86ceb2)

#### [v0.6.0](https://github.com/shawnphoffman/shared-contacts/compare/v0.5.1...v0.6.0)

> 16 January 2026

- 🔧 Chore: update configuration files and improve code formatting across the project [`dbbd496`](https://github.com/shawnphoffman/shared-contacts/commit/dbbd4968c551e1b9ddbd2d7ad1ab3e070d48c814)
- ♻️ Refactor: standardize route definitions and improve code formatting in routeTree.gen.ts [`62a5d36`](https://github.com/shawnphoffman/shared-contacts/commit/62a5d363f19820d7644a5b7ea057fe254a198289)
- ♻️ Refactor: update ESLint configuration to ignore the config file and remove unused type import in merge.ts for improved clarity [`1cf9cd9`](https://github.com/shawnphoffman/shared-contacts/commit/1cf9cd9e89a8e9e54e94dbee83b756fa733b9c57)
- 🔧 Chore: update .gitignore and package.json [`cefe1b7`](https://github.com/shawnphoffman/shared-contacts/commit/cefe1b777c92e5a4500850a27a3f9a0a23d9b5ed)
- ♻️ Refactor: standardize import formatting and clean up whitespace across various components for improved readability [`6f48431`](https://github.com/shawnphoffman/shared-contacts/commit/6f484316ca98c5db69cf0e6de8f25367b7905f24)
- ♻️ Refactor: update .env.example and docker-compose.prod.yml for improved configuration clarity and consistency; remove deprecated ui/.env.example file [`ea7c212`](https://github.com/shawnphoffman/shared-contacts/commit/ea7c2127f94ae9ad55b638875acfc9414dd3b733)
- 🔧 Chore: update package-lock.json to version 0.5.1, add new dependencies including bcrypt, cors, and express, and remove deprecated packages [`0fb1a58`](https://github.com/shawnphoffman/shared-contacts/commit/0fb1a5814ddbebe65a2c43462ab0acf26811f0c3)
- ♻️ Refactor: enhance error handling by replacing 'any' type with 'unknown' in various service files for improved type safety [`c34029d`](https://github.com/shawnphoffman/shared-contacts/commit/c34029d487f284bbc9e6f440009bc2371612f4bc)
- 🔧 Chore: update package dependencies for release management [`e477e80`](https://github.com/shawnphoffman/shared-contacts/commit/e477e8082ff10180530ced18e1d44e5d172011c1)
- 🔧 Chore: add GNU AGPLv3 license file and update README to reflect new licensing terms [`a66b495`](https://github.com/shawnphoffman/shared-contacts/commit/a66b4958c7de718f9a08097bdd2669c39b64d783)
- ✨ Feature: add backfill endpoint for shared contacts and implement backfill functionality in user management [`a90b419`](https://github.com/shawnphoffman/shared-contacts/commit/a90b419042186d4a30db5a59c2f8d12e724c6165)
- 🔧 Chore: enhance linting and formatting scripts in package.json files across the project [`dfecdd3`](https://github.com/shawnphoffman/shared-contacts/commit/dfecdd315792878dd8748c90a2cf12d3b252f7fd)
- ♻️ Refactor: remove version management script to streamline project structure and reduce complexity [`089bfe4`](https://github.com/shawnphoffman/shared-contacts/commit/089bfe49ba68fae60968286d8d7aec6532f671d1)
- 🔧 Chore: disable GitHub release in .release-it.json and remove init script from Dockerfile [`109375d`](https://github.com/shawnphoffman/shared-contacts/commit/109375d3c300ad70fe049db01d6ce236bd136a62)
- 🔧 Chore: update Docker and docker-compose configurations to enhance service stability and logging, and adjust environment variable paths [`63bcdcd`](https://github.com/shawnphoffman/shared-contacts/commit/63bcdcdeac21f95489f24da9b72d5ff62255f14f)
- 🔧 Chore: update docker-compose files to improve service configuration and add RADICALE_URL environment variable [`ac7fc59`](https://github.com/shawnphoffman/shared-contacts/commit/ac7fc595777e2f9416673559bdd19fda598e054e)
- 🔧 Chore: release v0.6.0 [`6027cc4`](https://github.com/shawnphoffman/shared-contacts/commit/6027cc4cd67c48ffdae9cf8fe547ff5e2a99064d)
- ♻️ Refactor: simplify docker-compose configuration by removing unnecessary environment variables and comments, and standardizing paths for improved clarity [`6caafe0`](https://github.com/shawnphoffman/shared-contacts/commit/6caafe042596a83c0e9b077b9c0f0fd6e0166ddd)
- Update issue templates [`6ef7ae1`](https://github.com/shawnphoffman/shared-contacts/commit/6ef7ae118efc4d78c6ec1fc1bc6472fedb2e989d)
- ♻️ Refactor: rename pool variable to dbPool for clarity in database query functions [`29b7f03`](https://github.com/shawnphoffman/shared-contacts/commit/29b7f039272a7e698b9afd6114f8b5082c3ec335)
- ♻️ Refactor: simplify CardDAV URL construction by using the UI origin and updating fallback for SSR to improve consistency and clarity [`672bfba`](https://github.com/shawnphoffman/shared-contacts/commit/672bfba7d3a966610f992b94ea7aed61eb0ddc51)
- ✨ Feature: add API health check route and update route tree to include health endpoint [`f01d981`](https://github.com/shawnphoffman/shared-contacts/commit/f01d981602beb350cf637aba506885c282f5e29b)
- ♻️ Refactor: move user initialization script to a separate file and update Dockerfile to copy it [`732c033`](https://github.com/shawnphoffman/shared-contacts/commit/732c0331e1a42f969e295351abc0616e04e775c2)
- Add sponsorship details for Ko-fi and Buy Me a Coffee [`2f8194a`](https://github.com/shawnphoffman/shared-contacts/commit/2f8194a89d1e337079ecc4095ea58822125f40db)
- ♻️ Refactor: enhance MultiFieldInput component by updating default type options and simplifying options retrieval logic [`3290840`](https://github.com/shawnphoffman/shared-contacts/commit/32908404781ef68f0a08e4c166b0ab8aa560e175)
- ♻️ Refactor: clean up whitespace and improve string handling in ContactsIndexPage component [`25daf56`](https://github.com/shawnphoffman/shared-contacts/commit/25daf562075cbdeb9ff867b7a68518587ef309ca)
- 🔧 Chore: update ESLint configuration to ignore specific directories for improved linting performance [`edae861`](https://github.com/shawnphoffman/shared-contacts/commit/edae861da98fd87d5bead0dd4df6cca6d9a58fd5)
- ♻️ Refactor: replace json utility with Response.json for consistency in health check route [`6476f1b`](https://github.com/shawnphoffman/shared-contacts/commit/6476f1be73c72cb02d563cc1680c6e1b5f41dc5b)
- ♻️ Refactor: remove versioning scripts from package.json for improved simplicity and clarity [`fe71b29`](https://github.com/shawnphoffman/shared-contacts/commit/fe71b29abd9f1e1ceea9e3aee9504b0491418442)
- ♻️ Refactor: remove optional chaining in email and phone extraction logic for improved readability [`2a857c3`](https://github.com/shawnphoffman/shared-contacts/commit/2a857c3c492a391cb56be20cb15774bc581b113a)
- ♻️ Refactor: update validation error state type and improve email filtering logic in ContactForm component [`f9491ce`](https://github.com/shawnphoffman/shared-contacts/commit/f9491ce0ba25e8a0bfe741cc96c8fbdae4de3f83)
- ✨ Feature: implement sync service for API requests and update route imports [`7adda99`](https://github.com/shawnphoffman/shared-contacts/commit/7adda99c972b3d681f250cd94378c42d599e0250)
- 🔧 Chore: release v0.5.3 [`052d58e`](https://github.com/shawnphoffman/shared-contacts/commit/052d58ea4327d1f79ab054b714c433bcba9923f2)
- Release 0.5.2 [`d5bfa4b`](https://github.com/shawnphoffman/shared-contacts/commit/d5bfa4ba9b54cee409fc96e908b81a99edcd0b43)
- ♻️ Refactor: improve address formatting logic and clean up code in AddressInput component [`eca4c3e`](https://github.com/shawnphoffman/shared-contacts/commit/eca4c3e4cecedac22e28dfad04522a2991d3d11d)
- ♻️ Refactor: comment out important notice section in CardDAVConnectionPage for clarity [`d313943`](https://github.com/shawnphoffman/shared-contacts/commit/d31394305971640b8a1d70bb0bf9f43e62bf9b71)
- 🐛 Fix: update phone number format in sample contacts migration [`d9b7499`](https://github.com/shawnphoffman/shared-contacts/commit/d9b7499a5934cb648da95b5f302048806b09551b)
- ♻️ Refactor: replace loose equality with strict equality in FieldError component for improved type safety [`66b6a0e`](https://github.com/shawnphoffman/shared-contacts/commit/66b6a0e1f847ad001ba02de4177fb053d546ea05)
- ♻️ Refactor: simplify GET handler in about route by removing async keyword [`404cf5b`](https://github.com/shawnphoffman/shared-contacts/commit/404cf5b2ecdb236cfa79813b0cd35d114cfbdd9e)
- ♻️ Refactor: remove optional chaining in character extraction logic for consistency and clarity [`f0608fb`](https://github.com/shawnphoffman/shared-contacts/commit/f0608fb94301ef784c77c4d1ab96d7dea70e674a)
- ♻️ Refactor: simplify character extraction logic in ContactCard component [`fb0586d`](https://github.com/shawnphoffman/shared-contacts/commit/fb0586d20e15e708e27763e2ebf2811c1291eefa)
- 🐛 Fix: update release notes script execution in .release-it.json [`0711b68`](https://github.com/shawnphoffman/shared-contacts/commit/0711b68041bbd29b60525f9f34390e14e322a2d7)
- Fix warning message in README.md [`ed92322`](https://github.com/shawnphoffman/shared-contacts/commit/ed923227406d32864a2ae60e971410cf0d7864c3)
- 📝 Docs: add new screenshot for Apple Contacts synchronization in README.md [`454b3b0`](https://github.com/shawnphoffman/shared-contacts/commit/454b3b0eddda8d302090f807f2fc119d1da14f04)

#### [v0.5.1](https://github.com/shawnphoffman/shared-contacts/compare/v0.5.0...v0.5.1)

> 15 January 2026

- 🔧 Chore: update environment configuration and remove deprecated files [`7054084`](https://github.com/shawnphoffman/shared-contacts/commit/7054084ec8a060d0b82171aa8addb786b0f4d3be)
- ✨ Feature: enhance contact management with phone number normalization and bulk delete functionality [`080b110`](https://github.com/shawnphoffman/shared-contacts/commit/080b110b6d4c74b30b0971d469f66b540aa8bc05)
- 🔧 Chore: bump version to 0.5.1 [`201a4d2`](https://github.com/shawnphoffman/shared-contacts/commit/201a4d28bd59f2cb99f65400eee6147677fdcaf5)
- 📝 Docs: update README.md with new screenshots for contact management features [`fac8516`](https://github.com/shawnphoffman/shared-contacts/commit/fac8516432bcf3390e9fde871fc1518986e14136)

#### [v0.5.0](https://github.com/shawnphoffman/shared-contacts/compare/v0.4.6...v0.5.0)

> 15 January 2026

- Enhance contact model and vCard handling with additional fields [`281ba46`](https://github.com/shawnphoffman/shared-contacts/commit/281ba46f960a5d3c47f35f12b276b42a615500d9)
- Refactor address handling in vCard generation and parsing [`2d70454`](https://github.com/shawnphoffman/shared-contacts/commit/2d7045419cd155c36d127818a175fb05caddc9b8)
- Refactor ContactsIndexPage to separate first and last name handling [`c618feb`](https://github.com/shawnphoffman/shared-contacts/commit/c618feb9d1eab410b8823d182b881a9cc150614e)
- Implement vCard type normalization in parsing logic [`3b82958`](https://github.com/shawnphoffman/shared-contacts/commit/3b829580e251b37a575456d50eb52cc7a41098bd)
- Enhance ContactDetailPage with job title and notes icons [`160068b`](https://github.com/shawnphoffman/shared-contacts/commit/160068b7fc02c71e77f59428fe37abd74fefff5f)
- 🔧 Chore: bump version to 0.5.0 [`b004f75`](https://github.com/shawnphoffman/shared-contacts/commit/b004f7510ae2cadb42a5739f4efafa62977dab2b)
- Add cursor pointer style for enabled buttons [`5d19f7e`](https://github.com/shawnphoffman/shared-contacts/commit/5d19f7ea5ba473fe8299571b4d8b1a09775befc6)

#### [v0.4.6](https://github.com/shawnphoffman/shared-contacts/compare/v0.4.5...v0.4.6)

> 15 January 2026

- 🔧 Chore: clean up dependencies and update README for Shared Contacts UI [`88f841a`](https://github.com/shawnphoffman/shared-contacts/commit/88f841ae6b62c00eb1b7cc159b51c925f10bf519)
- Enhance ContactsIndexPage with search functionality and refresh button [`dfd6eeb`](https://github.com/shawnphoffman/shared-contacts/commit/dfd6eebec663214e441598a311a292fd5581a92d)
- 🔧 Chore: bump version to 0.4.6 [`8c90923`](https://github.com/shawnphoffman/shared-contacts/commit/8c9092399c586aca91060935338d86590dc01123)

#### [v0.4.5](https://github.com/shawnphoffman/shared-contacts/compare/v0.4.4...v0.4.5)

> 14 January 2026

- Add structured address support in vCard generation and parsing [`88a5097`](https://github.com/shawnphoffman/shared-contacts/commit/88a50979175bca38246be50b9cf3bd148535c06b)
- 🔧 Chore: bump version to 0.4.5 [`8e25c69`](https://github.com/shawnphoffman/shared-contacts/commit/8e25c69649d1eb14683b9d086829e0ba8c00c1bc)
- Fix formatting issues in vCard generation by removing unnecessary blank lines for improved readability. [`62bc8f0`](https://github.com/shawnphoffman/shared-contacts/commit/62bc8f096e76ed41d931dabe57edd10f84ecd8cb)
- Fix header title from "xShared Contacts" to "Shared Contacts" for improved clarity. [`033cbe3`](https://github.com/shawnphoffman/shared-contacts/commit/033cbe3d9e16570687379c37d3b7adc73f2c6edd)

#### [v0.4.4](https://github.com/shawnphoffman/shared-contacts/compare/v0.4.3...v0.4.4)

> 14 January 2026

- Refactor router and component code to remove logging and improve clarity [`28413db`](https://github.com/shawnphoffman/shared-contacts/commit/28413dbbfd509978b5a37981765647a99c70eb02)
- 🔧 Chore: bump version to 0.4.4 [`0f550da`](https://github.com/shawnphoffman/shared-contacts/commit/0f550dad64db65107e7d063cdd1ee4e0b3c2650a)

#### [v0.4.3](https://github.com/shawnphoffman/shared-contacts/compare/v0.4.2...v0.4.3)

> 14 January 2026

- 🔧 Chore: bump version to 0.4.3 [`fe3041c`](https://github.com/shawnphoffman/shared-contacts/commit/fe3041c456ff3c8ccc886794f536b268f4a0ed7b)
- Update Docker build workflow to enable tagging based on GitHub reference type [`b87e03c`](https://github.com/shawnphoffman/shared-contacts/commit/b87e03c7b2539588dbae4e265b5439915103e8ea)

#### [v0.4.2](https://github.com/shawnphoffman/shared-contacts/compare/v0.4.1...v0.4.2)

> 14 January 2026

- Refactor deployment documentation and configuration [`7585480`](https://github.com/shawnphoffman/shared-contacts/commit/75854809e9d3ba0e6599c4d733903bc711ac3f6b)
- Add logging for router and query client initialization [`8ea00e6`](https://github.com/shawnphoffman/shared-contacts/commit/8ea00e61a4bb52c5481e6b67a71d9e7edcb21265)
- 🔧 Chore: bump version to 0.4.2 [`30250ff`](https://github.com/shawnphoffman/shared-contacts/commit/30250ff0c50898e35e32c6097420670717d07ec9)

#### [v0.4.1](https://github.com/shawnphoffman/shared-contacts/compare/v0.4.0...v0.4.1)

> 14 January 2026

- Update Docker build workflow to streamline image tagging [`3b6822c`](https://github.com/shawnphoffman/shared-contacts/commit/3b6822c4bbe31e42268b3eaff33cb98fe38ec264)
- 🔧 Chore: bump version to 0.4.1 [`3b9c6b0`](https://github.com/shawnphoffman/shared-contacts/commit/3b9c6b0fed3ff2e2822d2c5ab8395f2a26693ab1)

#### [v0.4.0](https://github.com/shawnphoffman/shared-contacts/compare/v0.3.0...v0.4.0)

> 14 January 2026

- Update Docker build workflow to comment out branch triggers for push and pull request events [`3ef4058`](https://github.com/shawnphoffman/shared-contacts/commit/3ef405850d09ba69a575baf2d4216f87ecf15f4a)
- 🔧 Chore: bump version to 0.4.0 [`79e5be7`](https://github.com/shawnphoffman/shared-contacts/commit/79e5be7dad1149c9f003aeceaa71f13182c3f6b2)
- Update Dockerfile to include root package.json for about metadata [`251df87`](https://github.com/shawnphoffman/shared-contacts/commit/251df87f38de3ba06a68ecc785af59eb1aba0c07)

#### [v0.3.0](https://github.com/shawnphoffman/shared-contacts/compare/v0.2.0...v0.3.0)

> 14 January 2026

- Enhance contact management with photo support in database and UI [`5597c54`](https://github.com/shawnphoffman/shared-contacts/commit/5597c549a371120a76fce3efd6ba9ddf38e376c2)
- Remove unused logo and manifest files, update favicon and icon references in the application. Enhance DeduplicateButton component to manage declined duplicate groups and improve visibility logic for duplicates. [`bc038a2`](https://github.com/shawnphoffman/shared-contacts/commit/bc038a2c4e62a7968a9c784c5d90025f8b72fdc3)
- Refactor contact photo handling in UI components [`bfe5e27`](https://github.com/shawnphoffman/shared-contacts/commit/bfe5e279f5228e983e3ba2fb4c77590da7e2e808)
- Add contact photo route and update migration files [`328232b`](https://github.com/shawnphoffman/shared-contacts/commit/328232b7cfbb1b8808a45e5db92c038d46d47f48)
- 🔧 Chore: bump version to 0.3.0 [`ae4e6cd`](https://github.com/shawnphoffman/shared-contacts/commit/ae4e6cd213bf9f409c89db57f27252c364b9af2f)

#### [v0.2.0](https://github.com/shawnphoffman/shared-contacts/compare/v0.1.0...v0.2.0)

> 14 January 2026

- Enhance database migration documentation and improve health check in Docker Compose [`f704a4c`](https://github.com/shawnphoffman/shared-contacts/commit/f704a4c482169702c1180a521fc6857251d77055)
- Enhance address handling in AddressInput and ContactForm components [`0c185ee`](https://github.com/shawnphoffman/shared-contacts/commit/0c185eeef36bd4de47f7836eb7bb5cb0c50d49df)
- Enhance AddressInput component with mode switching and display formatting [`4da6367`](https://github.com/shawnphoffman/shared-contacts/commit/4da636712d7e0391fa407e36520a47acf3ba96e8)
- Enhance database interaction and migration documentation [`a8759df`](https://github.com/shawnphoffman/shared-contacts/commit/a8759df39ecb0e6bb9a547584943b29ac30dd757)
- Refactor address handling in migrations and UI components for improved clarity [`44c0d3f`](https://github.com/shawnphoffman/shared-contacts/commit/44c0d3f2d7d9da1964c955ca27f324a962b37e0b)
- Refactor ContactForm to ensure at least one empty field and filter out empty submissions [`8f134ef`](https://github.com/shawnphoffman/shared-contacts/commit/8f134efdcf583c8fa51161c7d3e2ae8881e54981)
- 🔧 Chore: bump version to 0.2.0 [`ce45744`](https://github.com/shawnphoffman/shared-contacts/commit/ce4574430e9173677b07ee8bd5ccebdd8fef3fdb)
- Update layout of ContactsIndexPage for improved responsiveness [`5fb1b10`](https://github.com/shawnphoffman/shared-contacts/commit/5fb1b10891e7d1bafc76a366a33e43cc253f41bf)

#### [v0.1.0](https://github.com/shawnphoffman/shared-contacts/compare/v0.0.9...v0.1.0)

> 13 January 2026

- Refactor user management terminology and enhance contact form validation [`d2ba5b6`](https://github.com/shawnphoffman/shared-contacts/commit/d2ba5b61665f3be7b4a1314bfceb4af8301342a1)
- Add About page and API route to the application [`2c9c71b`](https://github.com/shawnphoffman/shared-contacts/commit/2c9c71bbf3e0a34108a1978c821c7779d80e5741)
- Update Docker Compose configuration for development environment and refactor UI components [`a26c3e1`](https://github.com/shawnphoffman/shared-contacts/commit/a26c3e1be557e79840969da19b808b9774dbd999)
- Improve error handling and orphaned file deletion in sync process [`d5dc9ef`](https://github.com/shawnphoffman/shared-contacts/commit/d5dc9ef1fffd977c9d67dc47c67dc54cef97c1cb)
- Refactor getVCardFiles and sync functions for improved readability [`07afec9`](https://github.com/shawnphoffman/shared-contacts/commit/07afec937c468a4ec9e2b8cddc5587ecbb2f11d3)
- 🔧 Chore: bump version to 0.1.0 [`7669c43`](https://github.com/shawnphoffman/shared-contacts/commit/7669c43319f62562f6916d3e72da6f5939e47196)
- Enhance layout of ContactsIndexPage for better responsiveness [`c121ec3`](https://github.com/shawnphoffman/shared-contacts/commit/c121ec3d1f5f015e7d82c4076c1272ebaf0f4665)
- Clean up whitespace in syncDbToRadicale function for improved readability [`f80127c`](https://github.com/shawnphoffman/shared-contacts/commit/f80127cd7fd2f933ac6a389043a51323f5b3474e)

#### [v0.0.9](https://github.com/shawnphoffman/shared-contacts/compare/v0.0.8...v0.0.9)

> 13 January 2026

- Refactor sync and watch functionality for improved performance and reliability [`ef6a28b`](https://github.com/shawnphoffman/shared-contacts/commit/ef6a28b9b8930e20737774c1acb713c26d51fd8a)
- 🔧 Chore: bump version to 0.0.9 [`692e179`](https://github.com/shawnphoffman/shared-contacts/commit/692e179cc5d0520cc664f8f4f3a357a8ff715a1e)

#### [v0.0.8](https://github.com/shawnphoffman/shared-contacts/compare/v0.0.1...v0.0.8)

> 13 January 2026

- Refactor package.json and version management script for consistency [`06bf2be`](https://github.com/shawnphoffman/shared-contacts/commit/06bf2be4775c648993ca26e971d48cb42ca071e4)
- Enhance sync functionality and metadata management for contacts [`80ef775`](https://github.com/shawnphoffman/shared-contacts/commit/80ef775e96da82e6da7322fc3a30e5ab2bcaf553)
- Update package versions and add versioning scripts for shared-contacts and sync-service [`a3a5964`](https://github.com/shawnphoffman/shared-contacts/commit/a3a5964e18c19fab6ffeaf31ecbbcd3a4589ba11)
- Refactor migration handling for improved readability and functionality [`b7f1b56`](https://github.com/shawnphoffman/shared-contacts/commit/b7f1b56ec753269475c4f290e29b2675b3968131)
- Update package versions to 0.0.4 and enhance version management script [`91e515e`](https://github.com/shawnphoffman/shared-contacts/commit/91e515eebbc612fca2ce91ce7d2828c395047a33)
- Refactor Docker Compose configuration for production deployment [`11d2656`](https://github.com/shawnphoffman/shared-contacts/commit/11d265603376237650b67b85eb23d779e96552d7)
- 🔧 Chore: bump version to 0.0.7 [`eae7a8e`](https://github.com/shawnphoffman/shared-contacts/commit/eae7a8e213fb1f896e446f77568ee85325dc5e08)
- Update package versions to 0.0.5 and enhance version management script [`59aa0dc`](https://github.com/shawnphoffman/shared-contacts/commit/59aa0dce42e3e9ebe750cecf03e4813401ef1648)
- Update Docker Compose and migration scripts for improved clarity and functionality [`83712ea`](https://github.com/shawnphoffman/shared-contacts/commit/83712ea07f5fe06b171061e3081d8ee02fd7e210)
- 🔧 Chore: bump version to 0.0.8 [`bf4a6c0`](https://github.com/shawnphoffman/shared-contacts/commit/bf4a6c078568c5733d63019379435ce10902b69b)
- 🔧 Chore: bump version to 0.0.6 [`3403c50`](https://github.com/shawnphoffman/shared-contacts/commit/3403c503c1bac113fe31ca04ef88c06f2c290128)

#### v0.0.1

> 13 January 2026

- More nonsense [`3d8f4c2`](https://github.com/shawnphoffman/shared-contacts/commit/3d8f4c2c1a3b8f5c3b75add672d98cbde46e99f2)
- Vibe coding with low confidence [`9d93b4b`](https://github.com/shawnphoffman/shared-contacts/commit/9d93b4bd01ed4e90894c9ecc1b72c4793b6cd127)
- Enhance UI development setup and add new contact merge functionality [`2c49e91`](https://github.com/shawnphoffman/shared-contacts/commit/2c49e9107f30e47238673acb1b7ffd5d6300dda8)
- Remove development profile from Docker Compose configuration [`7360ff7`](https://github.com/shawnphoffman/shared-contacts/commit/7360ff70999fa5ce3e8acf43f65164579b85d75a)
- plan1 [`c06982d`](https://github.com/shawnphoffman/shared-contacts/commit/c06982d561281b50249c937fab4d70750ef89bf1)
- Update Docker configuration and remove obsolete files [`25ae9fc`](https://github.com/shawnphoffman/shared-contacts/commit/25ae9fcce30f87ff12a5bb1fb03b6b317e68dfe3)
- Add CSV import functionality for contacts [`b7f1f46`](https://github.com/shawnphoffman/shared-contacts/commit/b7f1f4650f8e3eac2fad295c3eac7ebebf56f756)
- Refactor contact routes and components [`a82684b`](https://github.com/shawnphoffman/shared-contacts/commit/a82684b348c3f12885cee9ed175026e3cc678342)
- Refactor contact management to support multiple contact fields [`9608084`](https://github.com/shawnphoffman/shared-contacts/commit/96080849d332b43b90afff5a3da7841a5207d50d)
- Add Radicale users management routes and update Docker configuration [`9cb91ac`](https://github.com/shawnphoffman/shared-contacts/commit/9cb91ac3c32dbb27fa97fdf00f162d4801cd1fd2)
- bulk upload [`fb173f4`](https://github.com/shawnphoffman/shared-contacts/commit/fb173f4261d45bd9233cccd415d044615906fbf3)
- Update Docker Compose and Sync Service Configuration [`9d06573`](https://github.com/shawnphoffman/shared-contacts/commit/9d065738a2da98f21ea11f6c492b1932fbf0b62e)
- Refactor Docker and API configurations for improved service management [`16a3968`](https://github.com/shawnphoffman/shared-contacts/commit/16a3968bc6e10034216d24bb36f91f86e1f97d47)
- Update development mode documentation and refactor Docker Compose configurations [`db48e9a`](https://github.com/shawnphoffman/shared-contacts/commit/db48e9aa86fd6f535046774e18d996bc63c1c73d)
- Add deduplication functionality for contacts [`429d0a9`](https://github.com/shawnphoffman/shared-contacts/commit/429d0a9fca0aafe473f759f6465654bf4be49d2e)
- Adds production deployment configuration [`fd9aa2a`](https://github.com/shawnphoffman/shared-contacts/commit/fd9aa2a4de153fd0537f077144dd9192e822ea01)
- Add quickstart [`cac7af7`](https://github.com/shawnphoffman/shared-contacts/commit/cac7af7754385bfda857c1228c94caf0f7688f3d)
- Add table component and integrate into contacts index page [`5af8f9e`](https://github.com/shawnphoffman/shared-contacts/commit/5af8f9ec8b4261130c6f0aeec1ae5abccf5ef6ba)
- Improve CardDAV connection page with enhanced user guidance [`ba1e328`](https://github.com/shawnphoffman/shared-contacts/commit/ba1e328be29993d2332deec8fbf87a58a9e2b17b)
- New contact route [`6c1c246`](https://github.com/shawnphoffman/shared-contacts/commit/6c1c246b9840871f73ae9799a4cc7f2939657bd7)
- Initial commit [`164dd93`](https://github.com/shawnphoffman/shared-contacts/commit/164dd93c1aca860228cdf8ee6ca01eb25d07d2bc)
- Enhance contact information display with phone number formatting and support for multiple entries [`88a1bd9`](https://github.com/shawnphoffman/shared-contacts/commit/88a1bd9f3e8b07f282ca607d1e20cc601110fcb6)
- Refactor Radicale service configuration and initialization [`14ac9f8`](https://github.com/shawnphoffman/shared-contacts/commit/14ac9f8861bd963ff6430719b3e5d1bf4b3353c9)
- Add development UI service to docker-compose [`123d674`](https://github.com/shawnphoffman/shared-contacts/commit/123d67485a9b4eeaff7b2db49ad8a15a80dc7074)
- Refactor Dockerfile and entrypoint script for improved dependency management and cleanup [`4032025`](https://github.com/shawnphoffman/shared-contacts/commit/4032025a8b9dfdcc2609d53cb6eebe8dab532b5e)
- Add nickname support for contacts [`eccf9e4`](https://github.com/shawnphoffman/shared-contacts/commit/eccf9e41f87834dbb99a0def83e8713da99b36c9)
- Enhance Header component with theme toggle and navigation updates [`8586128`](https://github.com/shawnphoffman/shared-contacts/commit/8586128196c11a52beea4d02f83b0400b44e95b7)
- Add sample contacts migration with John and Jane Doe [`71b4295`](https://github.com/shawnphoffman/shared-contacts/commit/71b4295c0c86da914114850d8a1a9ba52ba75cf7)
- env [`7ca19c4`](https://github.com/shawnphoffman/shared-contacts/commit/7ca19c4bdc38f68c5299cc140bc078f00da0468c)
- Refactor ContactsIndexPage for improved row navigation and selection [`27943e1`](https://github.com/shawnphoffman/shared-contacts/commit/27943e1de01c6124be86e06418af9d01f19926fd)
- Add birthday field to ContactForm and display in ContactsIndexPage [`bae3fcc`](https://github.com/shawnphoffman/shared-contacts/commit/bae3fccda299abf42f61790c67d731aef88f550b)
- vibin [`db275e7`](https://github.com/shawnphoffman/shared-contacts/commit/db275e74961bfff8d12930a24bfcb6446e7a70b1)
- Refactor sync logic and error handling for contact updates [`b2250a7`](https://github.com/shawnphoffman/shared-contacts/commit/b2250a73c2dd4ddb5a3874e57bd7c9c1118b2dd2)
- Refactor Header component to comment out unused menu functionality [`df748cb`](https://github.com/shawnphoffman/shared-contacts/commit/df748cbdbf2cf27bcabf3490ed6e07f28fba4f86)
- Refactor docker-compose and db connection settings. Removed unused RADICALE_STORAGE_FILESYSTEM_FOLDER variable and added logic to create a users file if it doesn't exist. Updated SSL configuration in database connection to allow for more flexible SSL handling based on environment variables. [`367ba88`](https://github.com/shawnphoffman/shared-contacts/commit/367ba8841ca639a9c926bbac28dcf884e4a3a62d)
- Add important note for Apple Contacts configuration in CardDAV connection page [`39de215`](https://github.com/shawnphoffman/shared-contacts/commit/39de215f4eb54b0bfc476485625910d346bc358b)
- Add route handling for dynamic contact IDs [`c29f140`](https://github.com/shawnphoffman/shared-contacts/commit/c29f1407ab8465cfa621441d1b225a4a94abf46d)
- Update Radicale configuration to use multifilesystem storage type and specify filesystem folder path. [`ffdc051`](https://github.com/shawnphoffman/shared-contacts/commit/ffdc0517a1899089865a09e7704dc7a9640570a6)
