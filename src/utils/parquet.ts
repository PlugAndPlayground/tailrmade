import { DynamicImport } from './dynamicImport';

export async function readParquetFile(buffer: ArrayBuffer) {
  const { parquetRead, parquetMetadata } =
    await DynamicImport.dynamicImport('hyparquet');
  const { compressors } = await DynamicImport.dynamicImport(
    'hyparquet-compressors',
  );

  const data = await new Promise((resolve) => {
    parquetRead({
      file: buffer,
      compressors,
      rowFormat: 'object',
      onComplete: (data) => resolve(data),
    });
  });

  // clear out any bigInts in here
  (data as Array<any>).forEach((el: any) => {
    Object.keys(el).forEach((key) => {
      if (typeof el[key] === 'bigint') {
        el[key] = Number(el[key]);
      }
    });
  });
  return data;
}
