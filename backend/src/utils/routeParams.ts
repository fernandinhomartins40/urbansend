/**
 * Express 5 tipa route params como `string | string[]`, porque um param
 * repetido na URL chega como array. Estes helpers reduzem o valor ao
 * primeiro elemento, que e o que as rotas sempre assumiram.
 */

export const getRouteParam = (value: string | string[] | undefined): string => {
  if (Array.isArray(value)) {
    return value[0] ?? '';
  }

  return value ?? '';
};

export const getOptionalRouteParam = (
  value: string | string[] | undefined
): string | undefined => {
  const resolved = getRouteParam(value);
  return resolved.length > 0 ? resolved : undefined;
};
