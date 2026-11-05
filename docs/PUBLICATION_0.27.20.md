# Published 0.27.20 checkpoint ? October 24, 2026

Public release: https://github.com/Pardesco/polytope-laboratory/releases/tag/v0.27.20

GitHub `main` and annotated tag `v0.27.20` point to commit `62abb4c616d630a52a66176ae6b51590429f8c0b`.
The executable, matching source ZIP and SHA256SUMS.txt were uploaded, downloaded
and hash-verified before the community preview was published. Public API access
without authentication confirms the release and the asset digests.

Publication used an isolated checkout at `build/publication-0.27.20`, reconstructed
from the sealed 0.27.20 source archive. The original working checkout's HEAD
remains `37a602738e478e4996f982c366b1bed3bbed8bed`; its index and unfinished 0.27.21 runtime were preserved.
Do not pull, reset or clean the dirty original checkout to match GitHub. Use the
isolated checkout for follow-up publication operations. Git authentication for the
push used the existing GitHub CLI credential helper, without storing a new token.

Current local development remains 0.27.21, with 2,474 qualified source inputs still
matching the full source-test receipts. Publication updated local download/status
documentation only; their older hashes describe the pre-publication checkpoint.
No Electron launch, new package, 0.27.21 freeze/seal or 0.27.21 publication occurred.

Publication evidence: `artifacts/github-publication-0.27.20/published-verification.json`
and `draft-verification.json`. The original sealed release/archive and earlier
qualification receipts remain unchanged. Further 0.27.21 work starts with
[the handoff](HANDOFF_0.27.21.md); its packaged gates remain outstanding.
