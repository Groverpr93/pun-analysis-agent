/**
 * Raw `/api/chat` response bodies recorded from the real Phase 1 Backend
 * (`curl -N` against `pnpm dev` in backend/, 2026-09-23), byte-for-byte.
 * The live adapter's parsing tests replay these instead of a live stream,
 * per docs/design/frontend-design.md's "Development & testing" section.
 */

/**
 * A successful reply from Gemini. Deliberately includes multi-byte UTF-8
 * characters (¿ é ñ ¡) so tests can split the bytes mid-character.
 */
export const recordedPhase1Stream =
	'data: {"message":"¿Qué le dijo una piñata a otra antes de la fiesta?: \\"¡No te rajes!\\" "}\n\n' +
	'data: {"message":"\\n\\nIt\'s a pun because the Mexican idiom *\\"no te rajes\\"* means \\"don\'t chicken out,\\""}\n\n' +
	'data: {"message":" but literally translates to \\"don\'t split open.\\""}\n\n' +
	'data: {"result":"¿Qué le dijo una piñata a otra antes de la fiesta?: \\"¡No te rajes!\\" \\n\\nIt\'s a pun because the Mexican idiom *\\"no te rajes\\"* means \\"don\'t chicken out,\\" but literally translates to \\"don\'t split open.\\""}\n\n';

/**
 * HTTP 200 with a mid-stream `error:` event: Backend run with an invalid
 * Gemini API key (re-recorded 2026-09-23 after TASK-23 made error messages
 * user-facing, per docs/contracts.md's "Failed replies").
 */
export const recordedErrorStream =
	'error: {"error":{"status":"INVALID_ARGUMENT","message":"Something went wrong. Please try again."}}\n\n';

/**
 * Phase 2: a whole reply with one `analyze_pun` call, recorded from
 * TASK-9's Backend (PR #47: `pnpm dev` with `APP_CHECK=off`, real Gemini,
 * `curl -N`, 2026-09-27), byte-for-byte: the call, its result, then the
 * reply text and `result`, which repeats that text without the tool call.
 * The part-level `metadata` (Gemini's thought signature) is one of the
 * fields docs/contracts.md says to ignore, kept to prove we do. Until
 * TASK-11, Backend answers every call with the undetermined result.
 */
export const recordedToolCallStream =
	'data: {"message":{"role":"model","index":0,"content":[{"toolRequest":{"name":"analyze_pun","input":{"text":"I used to be a banker, but I lost interest."},"ref":"call_125622"},"metadata":{"thoughtSignature":"EqkDCqYDAWkUfRMG7ft2fJbqs1OxYJuty9OEeySjkLrGo/MwAqH/M0v0VqI8909IpytxIo481uehwXy+ByfcAtckIB5zRSfvvvOyc+vzCXArh5EksEW5mUZn9ku3tz2WsoCHC1bp8gm6pUVZ5GfA8PxydOkEPDXwor8fRjn7u9aSmNUwkXe7MWwwjF73G06u65iAGjOEgmcAwWBg935FOMo32S26kkFMmbT6aeKnqYXIUXCaoXl3yUMstuMFD5uu/vRdZGeRzqTXJuWs+03g+ikBTgEarBLgPeMpeDMr8KouBc8CxHx1mvNawFsJyM6WiaOU5jtXEU9axTq8g7L5dv+eUwIQdREJdKR6wxXApVMidLSNUR49LwL6SpWPROSFlIKKddO9G5hpYLM2bEbPwhhqq6sYlqoLI3B66OkwY9UJy79Nz515fNZ30w24yIUkKX7+VLBSg4TyfyAmJI+afQ3g6XcpmQSA6My1/2BGX+TqhmbNIYnKH+iXOCvxTRbboSOSox46NomkNjCWMX8/gpTdzSmJzrPaSw5PI+uW6ceTcOqoQrmtdG7MdqE="}}]}}\n\n' +
	'data: {"message":{"role":"tool","index":1,"content":[{"toolResponse":{"name":"analyze_pun","ref":"call_125622","output":{"is_pun":null,"pun_type":null,"words_involved":[],"explanation":"","confidence":null,"sense_source":null}}}]}}\n\n' +
	'data: {"message":"Yes, that"}\n\n' +
	'data: {"message":" is a pun! \\n\\nThe humor relies on the double meaning of the word **\\"interest\\"**:\\n\\n1. **Enthusiasm /"}\n\n' +
	'data: {"message":" Curiosity:** Losing motivation, desire, or enthusiasm for working in banking.\\n2. **Finance:** The financial fee charged"}\n\n' +
	'data: {"message":" for borrowing money or earned on deposits/investments, which is a core concept in banking."}\n\n' +
	'data: {"result":"Yes, that is a pun! \\n\\nThe humor relies on the double meaning of the word **\\"interest\\"**:\\n\\n1. **Enthusiasm / Curiosity:** Losing motivation, desire, or enthusiasm for working in banking.\\n2. **Finance:** The financial fee charged for borrowing money or earned on deposits/investments, which is a core concept in banking."}\n\n';

/**
 * Phase 2: one `analyze_pun` call and its result, recorded the same way
 * while Gemini was overloaded: the model turn after the result failed
 * with Backend's error event, so the call completed but the reply didn't.
 */
export const recordedToolCallThenErrorStream =
	'data: {"message":{"role":"model","index":0,"content":[{"toolRequest":{"name":"analyze_pun","input":{"text":"I used to be a banker, but I lost interest."},"ref":"call_71294"},"metadata":{"thoughtSignature":"EsMECsAEAWkUfRPA9by6wlFC8yyMJKm3vPsfUeyar8w92254xqKEs71EQ2yJHAVV9tLIPHymyNZ1haglfc6eH0/u3X8AbQkLXXDmBTm0CE4VXZt6CoFRF3mAXhJ+qi9HjGPayMjKai8VPt03XGgZweJN9qijyqtYYAiYSxRk1LCFhM14nTfMUh1z8v1s6mfYjLTfc85VuTl0rWyP5vtwxwIcEePo+65s8yKMiQrOEfG1IMsIgzXG6wRrTkcnffuFQcXc8ckyQ0LP4eyOmJ/xwtPHdI4o9NPqXd7x44rdX0cRYH5wlMJ9uIPmWslpYq0M3sREA8833b08n8pIUUMekFVT4DaPCPPlY3/jGZ9sS8Y+CWRJvuZqhkBW7IeGaYb/NNF3lzxMdJ5HAAEtaKOAi9HKxDs6DajZQ1qJbfdqtiLAMJ/klu0BWX+HjkbJXGnZ7KuUTS/H2uKfoEbvyM6sH1EmHv7wk7o8R60BPXEv9FzMtcKCItfBVKSdev+ht7Te+t3nSsQMlycEzZxGMs4MUm+BjUE0c6M/b0EPnAtbYyzOqkVtF7c6XehTLE3R3NX91/30Oz1qPb7oRxkO5vyoqFdFzMdaOYQ2YtLPWn09BGzxGvUyTHONddTih7AVdHuOl+hY6ykfAYysCHy/gQwHXjbj2hO+wb7n2WLWeLwTnAduxoBKuyrrXQD286SotlJzIoWLTx3q4mcruVjgKaZplNMwNXMSaYC8kMO99D/9SpVnOTAqWv2Q+e9yBx5OjPvhW+YJTl/u"}}]}}\n\n' +
	'data: {"message":{"role":"tool","index":1,"content":[{"toolResponse":{"name":"analyze_pun","ref":"call_71294","output":{"is_pun":null,"pun_type":null,"words_involved":[],"explanation":"","confidence":null,"sense_source":null}}}]}}\n\n' +
	'error: {"error":{"status":"UNAVAILABLE","message":"The assistant is busy right now. Please try again in a moment."}}\n\n';

/**
 * Phase 2: two parallel `analyze_pun` calls, recorded the same way. Gemini
 * sent each call in its own chunk (same `index`) and Backend returned both
 * results in one `tool` chunk, paired by `ref`. Gemini was overloaded here
 * too, so it ends like the stream above.
 */
export const recordedParallelToolCallsStream =
	'data: {"message":{"role":"model","index":0,"content":[{"toolRequest":{"name":"analyze_pun","input":{"text":"Time flies like an arrow; fruit flies like a banana."},"ref":"call_109468"},"metadata":{"thoughtSignature":"EtgGCtUGAWkUfRO8xZtEHOLUoewCdla00XOFEvuqXtFNoMKZ9t/zvdp9Rl8x/cNqFfFDLh0Bddk3k1aEgllXQ8X4uzyB7ZFwWnGtpOsoFIvsbneKuW6ZiLgtoNm12pDehLUCY1MQTgRw7uQtc4WsjkGrrhDlxzl2l2V6zi3ROplalDBF+OgnqlmAk6dXZ8CUFst++M4iYLPiBREfAJIsrJRCvyVV4YQ4AclT4D9OhAKSDsy3hhsg3w8fh1jqIS0rCJ4PN4v5EgqIukmTKAT9KDgrXacPNrJzDqrUFrbgltk2s5voFbu71WcHKHG+irqBVEBF+IO/FXeFoLRVugUq4MuVMOKfnwpllSWYtdmUODQJafI0+mLBQdr0B/K63m5ZQfTuf4ZY1XufE3slRyV/7gCLOlfN0ddSgB0dmBo7Zj7RN+Zj2j58mcHRx+lWB9IiXBbYigfR6gaMYIfNwEja1DJ8a4B7T0oajXfaIbU1VKCHtG8wnO4UUP3dx6HUL26le5ChCGUAWt2D5q0JbRIEZmBHN2ok45wwsqTeVFyl9VF4hDao6IN3eeoVdiow8tscoSpP4jIyVZuHQS6/6rMWD5ZwVPFEhY+3+GbnSssdAPUktDytG0OkuHpbBKhlR+ivSCTGaA/sHWaF4dbp0NftE/pSw8PAMeFvNQ2MAiMJYlUv5qQSKP+I/AUQE4OklxNCFZG3/fyaBC0JcmIKWLHtLJfCK9hPVNvg9hSE8hXCbDk7BGSa2sgwZKvdNCmyjvGOCeyg4jIAwwMfSvtDN8CoO6S9q5/82BKgqa4STzAKGWWxHpt22FO1j3l97WgatywxEAWF+LWa1IlnlNEmpgK9/v3E8RqBmadzdBIWXbOom47EyhRCwZ09B2KSdSgulL04Le8/8lJKolAIcyTIkw4iCdf5BvPytZfcATeG7NnKQBtn2wU/XKiCMBRSfPwG/8hnRnzNJA7em2wAXjJ2WibMcbwHGgZreVs37XoMJhZYY2HfY8AcmCMD+cjwS/Ma/lhT6zPql7Jwuw6ghd1m+3bqYnDyL7ODyBeME971M65v5OhZe+Ze3V4jG1Luu2W+5x9Ihm8vb1s5BaURQDeTM54Ak5RIv8ONtqy1m5UnGycqK5dB0zt27+MQ8bl/LA=="}}]}}\n\n' +
	'data: {"message":{"role":"model","index":0,"content":[{"toolRequest":{"name":"analyze_pun","input":{"text":"The meeting starts at noon."},"ref":"call_109471"}}]}}\n\n' +
	'data: {"message":{"role":"tool","index":1,"content":[{"toolResponse":{"name":"analyze_pun","ref":"call_109468","output":{"is_pun":null,"pun_type":null,"words_involved":[],"explanation":"","confidence":null,"sense_source":null}}},{"toolResponse":{"name":"analyze_pun","ref":"call_109471","output":{"is_pun":null,"pun_type":null,"words_involved":[],"explanation":"","confidence":null,"sense_source":null}}}]}}\n\n' +
	'error: {"error":{"status":"UNAVAILABLE","message":"The assistant is busy right now. Please try again in a moment."}}\n\n';
