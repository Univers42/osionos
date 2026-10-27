# Provider routing of the summary — context C393

A run on a user's connection, in a thread long enough to be summarised, sends nothing to the platform upstream:
the summary is written by the connection the run answered with (C377), on the service image, through HTTP only.

- Date: 2026-10-26T22:17:06Z
- Commit: 5c4665ae19b4b55c23fd2bd8e136a5c53dc94b83
- Image: osionos-ai:c393-02065c357 sha256:d8c42af039dd
- Command: `MODELS_DIR=<groot>/models AI_IMAGE=<image> sh services/osionos-ai/eval/provider-routing.sh`

## Result: PASS

Requests logged by the proxy in front of each upstream during each thread, then the calls each mock took (in
brackets: the summary calls among them).

| Thread | Runs | Summary written | Platform proxy | User key proxy | User endpoint proxy | Platform mock | User key mock | User endpoint mock | |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| platform default (control) | 5 | yes | 6 | 0 | 0 | 6 (1) | 0 (0) | 0 (0) | PASS |
| user's API key | 5 | yes | 0 | 6 | 0 | 0 (0) | 6 (1) | 0 (0) | PASS |
| user's own endpoint | 5 | yes | 0 | 0 | 6 | 0 (0) | 0 (0) | 6 (1) | PASS |

A thread passes when its summary is written, every request it caused went to its own upstream (runs and the
summary call), and the two other proxies logged none. The platform thread is the control: it shows that the
platform proxy does log the summary call when the platform is the target.

## Caveat

The image runs with NODE_ENV=development: production refuses a user endpoint on a private network and the provider
URL override that sends the user's API key to a mock. The routing code is the same in both modes. The proxies
count requests per upstream; a call to a host that is none of the three would not show here.
