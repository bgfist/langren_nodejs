Parse.Cloud.beforeSave(Parse.User, function(request,response) {
     var score = request.object.get("score");
     if(!score){
          score = 0;
          request.object.set("score",score);
     }

     if(!request.object.get("nickname"))
         request.object.set("nickname",request.object.get("username"));
       
     request.object.set("title",getTitleFromScore(score));
     response.success();
});




function getTitleFromScore(score){
        if(score<10){
            return "默默无名";
        }else if (score < 20) {
            return "初为人知";
        }else if(score<30){
            return "小有名气";
        }else if(score<40){
            return "受到尊敬";
        }else if(score<50){
            return "耳熟能详";
        }else if(score<60){
            return "广为人知";
        }else if(score<80){
            return "远近驰名";
        }else if(score<100){
            return "不可企及";
        }else if (score<150){
            return "传说中的";
        }else{
            return "上 帝";
        }
}