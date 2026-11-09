export function joystickKeys(x:number,y:number,deadzone=0.22):number[]{
 if(!Number.isFinite(x)||!Number.isFinite(y)||Math.hypot(x,y)<deadzone)return [];
 const sector=(Math.round(Math.atan2(y,x)/(Math.PI/4))+8)%8;
 return [[262],[262,264],[264],[263,264],[263],[263,265],[265],[262,265]][sector];
}
/** Multiple pointers and the physical keyboard share ownership of each key. */
export class KeyOwners {
 private owners=new Map<string,Set<number>>();
 constructor(private send:(code:number,down:boolean)=>void){}
 set(source:string,keys:readonly number[]){
  const before=this.keys();if(keys.length)this.owners.set(source,new Set(keys));else this.owners.delete(source);
  const after=this.keys();
  for(const key of before)if(!after.has(key))this.send(key,false);
  for(const key of after)if(!before.has(key))this.send(key,true);
 }
 private keys(){return new Set([...this.owners.values()].flatMap(s=>[...s]));}
 clear(){const keys=this.keys();this.owners.clear();for(const key of keys)this.send(key,false);}
}
