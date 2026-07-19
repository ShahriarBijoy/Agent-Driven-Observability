// kubernetes-mixin, aligned to THIS lab (PLAN-2 P8).
//
// The #1 self-hosted footgun: the mixin defaults to job="kube-state-metrics"
// etc., while the k8s-monitoring chart scrapes with job="integrations/
// kubernetes/*" - dashboards render, silently empty. These _config selector
// overrides are the entire point of building from source instead of
// importing dashboards off grafana.com.
//
// Built by build.sh (dockerized jb + jsonnet); outputs land in
// ../provisioning/dashboards/ and infra/mimir/rules/anonymous/.
(import 'kubernetes-mixin/mixin.libsonnet') + {
  _config+:: {
    kubeStateMetricsSelector: 'job="integrations/kubernetes/kube-state-metrics"',
    cadvisorSelector: 'job="integrations/kubernetes/cadvisor"',
    kubeletSelector: 'job="integrations/kubernetes/kubelet"',
    kubeApiserverSelector: 'job="integrations/kubernetes/kube-apiserver"',
    clusterLabel: 'cluster',
    // Adds the cluster template var - harmless with one cluster, and the
    // cluster="obs-lab" external label is already on every series.
    showMultiCluster: true,
    grafanaK8s+:: {
      // Mirror the lab's Grafana refresh cadence (provisioning reloads
      // every 30s anyway).
      refresh: '30s',
    },
  },
}
