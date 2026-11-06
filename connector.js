import {ESTIMATE_KEY,badgeData} from "./core.js";
async function loadBadges(t) {
  const [card,estimates]=await Promise.all([
    t.card("idList","checklists"), t.get("card","shared",ESTIMATE_KEY,{})
  ]);
  return badgeData(card.checklists||[],estimates||{},card.idList);
}
window.TrelloPowerUp.initialize({
  "card-badges": function(t) {
    return [0,1].map(index => ({
      dynamic: async function () {
        try {
          const badges=await loadBadges(t);
          return {...(badges[index]||{text:""}),refresh:60};
        } catch (_error) { return {text:"",refresh:60}; }
      }
    }));
  },
  "card-buttons": function() {
    return [{text:"NOTHING · Estimar criterios",callback:function(t) {
      return t.popup({title:"Estimaciones de trabajo",url:"./estimate.html",height:420});
    }}];
  },
  "card-detail-badges": async function(t) {
    try {
      const badges=await loadBadges(t);
      return badges.map((badge,index)=>({title:index===0?"Criterios verificados":"Horas pendientes",...badge}));
    } catch (_error) { return []; }
  }
});
