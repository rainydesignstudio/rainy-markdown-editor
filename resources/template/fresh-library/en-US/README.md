# Rainy Markdown Editor Library

Check the running version of Rainy Markdown Editor. First reuse a matching local checkout or manual copy whose location is already known from the user, the conversation, or relevant documentation.

If matching manuals are missing, find the corresponding tag in the [official releases](https://github.com/rainydesignstudio/rainy-markdown-editor/releases). Choose an absolute destination outside the library and ask the user first:

> Before I start, I need to fetch this version’s shared manuals for people and agents from the official repository and save them to `<absolute path>` for later reuse. Is that okay?

After the user agrees, create the folder and fetch the repository-root `README.md` and the Chinese and English manuals under `docs/locale/`. Preserve the repository layout and record the release tag and local path for future sessions. Reuse a matching copy or any prior approval that covers the same download and destination.

Start with the local `docs/locale/en-US/AGENT-GUIDE.md`. Read the sections required for the task, then check this library’s effective format configuration, stylesheet, and validation rules. If required manuals are missing, get permission to fetch them or find a usable copy before writing.

Ask “Would you prefer to run Rainy locally?” once, when first taking over a library in a new session. Follow any preference the user has already stated. Continue reading the manuals and working on the task while waiting for the deployment decision.

- If the user keeps using the website, read the local manual copy.
- If the user chooses local deployment and no checkout is known, fetch the full project at the matching release tag, start it, and read the manuals from that checkout.
- If the user chooses local use and a project path is known, reuse that checkout, start it according to its version’s instructions, and read the manuals there.
