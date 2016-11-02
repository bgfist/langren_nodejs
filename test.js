//import 'babel-polyfill'

const arr = [1,2,3,4,5];
const arr2 = [1,2,3,4,5];

for(var i=0 ;i< arr.length;i++){
    console.log(arr,arr[i]);
    if(i===1)
    {
       arr.splice(i,1);
    }
}

console.log('-----------------')

arr2.forEach(num=>{
    console.log(num);
    if(num===2)
    {
      arr2.splice(arr2.indexOf(num),1);
    }
})