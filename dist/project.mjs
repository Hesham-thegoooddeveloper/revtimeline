const amount=v=>v===null||v===undefined||v===''?null:Number(v);
export function projectAmounts(value,rate){
  value=amount(value);rate=amount(rate);
  if(value===null||rate===null||!Number.isFinite(value)||!Number.isFinite(rate)||value<0||value>1e12||rate<0||rate>100)return {vat:null,total:null};
  const base=Math.round(value*100),vat=Math.round(base*rate/100);
  return {vat:vat/100,total:(base+vat)/100};
}
export function projectDetails(project){
  const d=project.details||{};
  return {scope:d.scope??project.description??'',customer:d.customer??'',currency:['SAR','AED','USD','EUR','GBP'].includes(d.currency)?d.currency:'SAR',value:amount(d.value),vatRate:amount(d.vatRate),paymentTerms:d.paymentTerms??''};
}
