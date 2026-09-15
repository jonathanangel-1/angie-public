export function inheritStableVisualEvidence(product, previousById) {
  const prior = previousById.get(product.id);
  if (!prior || prior.imageSourceUrl !== product.imageSourceUrl) return product;
  return {
    ...product,
    ...(prior.visualEnrichment ? { attributes: { ...product.attributes, ...prior.attributes }, visualEnrichment: prior.visualEnrichment } : {}),
    ...(product.privateImageEvidence || prior.privateImageEvidence?.sourceUrl === product.imageSourceUrl
      ? { privateImageEvidence: product.privateImageEvidence || prior.privateImageEvidence } : {}),
  };
}
