import React from 'react';
import InterfaceController from '../InterfaceController';

export class DynamicImport {
  private static dynamicImports: Record<string, any> = {};
  public static tryGetImportImmediately(name: string) {
    return DynamicImport.dynamicImports[name];
  }

  public static async dynamicImport(packageName: string): Promise<any> {
    if (DynamicImport.dynamicImports[packageName] == undefined) {
      InterfaceController.showSnackBar(
        <span>
          Installing <b>{packageName}</b> ...
        </span>,
        {
          key: packageName,
        },
      );
      console.time(`${packageName} imported`);
      const url = 'https://esm.run/' + packageName;
      DynamicImport.dynamicImports[packageName] = await import(
        /* webpackIgnore: true */ url
      );
      console.timeEnd(`${packageName} imported`);
      InterfaceController.hideSnackBar(packageName);
      InterfaceController.showSnackBar(
        <span>
          <b>{packageName}</b> was installed
        </span>,
      );
    }
    return DynamicImport.dynamicImports[packageName];
  }
}
