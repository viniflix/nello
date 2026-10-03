export function releaseMetadata(release, environment = 'production') {
  return {
    name: 'nello-release-metadata',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'release.json', source: JSON.stringify({ schemaVersion: 1, release, environment }) });
    },
  };
}
