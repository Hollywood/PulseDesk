# PulseDesk live demonstration

This script is designed for a Harness Solutions Engineer assessment. It keeps
the application explanation short and makes governance, deployment safety, and
observable evidence the center of the story.

## Before the session

Capture evidence as requested by the assessment PDF:

- Harness project, delegate, connector, and pipeline configuration screenshots.
- One successful PR validation execution and its GitHub status check.
- One main-branch image build with the commit SHA tag visible in Docker Hub.
- Canary, verification, promotion, and failed-verification rollback executions.
- `kubectl` workload state and a successful health response after promotion and
  after rollback.

Run the preflight without changing infrastructure:

```bash
git status --short --branch
docker ps
minikube status
kubectl config current-context
kubectl get nodes -o wide
kubectl get pods -A
kubectl get deployments -A
pnpm --dir claims-api gate
pnpm --dir web test
pnpm --dir scheduling-api test
pnpm -r typecheck
```

Expected baseline gate evidence includes:

```text
"gate":"pass","state":"buggy","certification":"expected_red"
```

## 1. Frame the business problem

Open `TICKET-1042` in PulseDesk. Explain that a synthetic claim submission was
accepted but timed out, then a retry used a new idempotency key and created a
duplicate logical submission. The value proposition is not the small code
change; it is a governed path from evidence to a safe production decision.

## 2. Ticket to merge-ready pull request

Preferred path, when Cosmos access is configured:

1. Assign or dispatch `TICKET-1042` to the Cosmos ticket-to-PR loop.
2. Show repository context, the deterministic reproduction, and the proposed
   one-binding fix.
3. Show the tests Cosmos ran and the feature branch it created.
4. Open the pull request and point out that Cosmos cannot merge it.

Fallback path, if Cosmos is not available in the assessment account:

1. Run PulseDesk locally and select **Run PulseDesk analysis**.
2. Show the local `pulsedesk/TICKET-1042` branch, root-cause evidence, focused
   diff, and generated pull-request summary.
3. State explicitly that the same CI/CD path remains real; only ticket dispatch
   is being demonstrated with the local deterministic workflow.

## 3. Pull-request governance

Open the Harness CI execution started by the PR-to-`main` trigger. Show:

- checkout of the PR revision rather than hard-coded `main`;
- the state-aware claims gate;
- web and scheduling JUnit reports;
- workspace type checks and production builds;
- the GitHub status check blocking merge on failure;
- no image publication or deployment from the PR.

Narration: developers get fast evidence, while the organization preserves a
human merge decision and prevents unreviewed delivery.

## 4. Approval and merge

Have the human reviewer inspect the root cause, focused diff, and CI result.
Approve and merge only after the required check is green. Show the main-push
execution starting automatically.

## 5. Immutable artifact

In the main execution, show the Docker build and Docker Hub push. Record the
full image name and commit SHA tag. In the CD stage, show that exact tag selected
as the primary artifact.

Narration: the reviewed commit, published artifact, and deployed workload are
traceable as one supply-chain event.

## 6. Canary and verification

In Harness CD, show these native steps:

1. Fetch and render the Kubernetes manifests.
2. Deploy the canary workload.
3. Check Kubernetes steady state and `GET /api/health`.
4. Pause for Harness approval.
5. Promote with a full rolling deployment.
6. Remove canary resources.

While the approval is waiting, show real cluster evidence:

```bash
kubectl -n pulsedesk get deployment,replicaset,pods,service -o wide
kubectl -n pulsedesk describe deployment pulsedesk
```

After promotion:

```bash
kubectl -n pulsedesk rollout status deployment/pulsedesk --timeout=180s
kubectl -n pulsedesk port-forward service/pulsedesk 4310:80
curl --fail http://127.0.0.1:4310/api/health
```

## 7. Controlled verification failure and rollback

Use a dedicated demo execution or input that changes only the verification URL
to a known failing path such as `/api/health/forced-failure`. Do not commit a
fake success and do not alter the shared health endpoint.

1. Deploy the canary artifact.
2. Show the HTTP verification failure.
3. Show the configured failure strategy invoke canary cleanup and stage
   rollback.
4. Confirm that the prior stable ReplicaSet is active.
5. Re-run the real health request and show `{"status":"ok"}`.

Narration: Harness turns an observed signal into a deterministic safety action;
the failed release does not become the stable release.

## 8. Close on enterprise value

Summarize the controls demonstrated:

- event-driven ticket-to-PR automation with bounded agent authority;
- repeatable CI evidence and merge protection;
- immutable artifact traceability;
- reusable connectors, services, environments, infrastructure, and templates;
- progressive delivery with a human checkpoint;
- observable promotion and automatic rollback.

Avoid claiming Cosmos, Docker Hub publication, Continuous Verification, or a
Harness deployment succeeded unless the corresponding execution is visible.
