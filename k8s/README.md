# PulseDesk Kubernetes manifests

These manifests are intended for the Harness Kubernetes deployment step.

## Harness manifest settings

- **Store:** GitHub
- **Branch:** `main`
- **Deployment path:** `k8s/deployment.yaml`
- **Values path:** leave empty (this is plain Kubernetes YAML, not Helm)
- **Service path:** `k8s/service.yaml`
- **Namespace:** choose it in the Harness infrastructure definition; the files
  intentionally do not hard-code one.

The Deployment uses Harness's primary-artifact expression:

```yaml
image: <+primary.artifact.image>
```

At execution time, Harness replaces that expression with the Docker Hub image
and tag selected for the service. Never put Docker Hub credentials or Kubernetes
tokens in these files. For a private image, configure the Docker connector and
an image pull secret through Harness or the target namespace.

## Local validation

Replace the Harness expression temporarily for a client-side Kubernetes check:

```bash
sed 's|<+primary.artifact.image>|pulsedesk:local|' k8s/deployment.yaml \
  | kubectl apply --dry-run=client --validate=false -f -
kubectl apply --dry-run=client --validate=false -f k8s/service.yaml
```

Build and smoke-test the container locally:

```bash
docker build -t pulsedesk:local .
docker run --rm -p 4310:4310 pulsedesk:local
curl --fail http://localhost:4310/api/health
```

The Service is intentionally `ClusterIP`. Use Harness verification, a temporary
port-forward, or an existing ingress to reach it; do not expose a public load
balancer solely for the interview demo.
