import React, { useEffect, useRef, useState } from "react";
import { View, Text, Image, Pressable, StyleSheet, Animated } from "react-native";
import { api, Player, ProviderConfig, Venue } from "./api";
import { portraits, venueArt } from "./art";

export default function MatchSearch({venue,player,busy,error,onCancel,onPlay}:{venue:Venue;player:Player;busy:boolean;error:string;onCancel:()=>void;onPlay:()=>void}) {
  const [status,setStatus]=useState("Checking opponent availability…");
  const [failed,setFailed]=useState(false);
  const [ready,setReady]=useState(false);
  const [seconds,setSeconds]=useState(15);
  const rotation=useRef(new Animated.Value(0)).current;
  const play=useRef(onPlay);play.current=onPlay;
  useEffect(()=>{
    let alive=true;
    const start=Date.now();
    const animation=Animated.loop(Animated.timing(rotation,{toValue:1,duration:1800,useNativeDriver:true}));animation.start();
    const interval=setInterval(()=>setSeconds(Math.max(0,15-Math.floor((Date.now()-start)/1000))),250);
    let launch:ReturnType<typeof setTimeout> | undefined;
    void api<ProviderConfig>("/config","GET",undefined,14000).then(config=>{
      if(!alive)return;
      // Do not pretend to search a live player pool before real-time PvP is available.
      if(config.onlineMatchmaking) throw new Error("Online matching needs an updated client.");
      setStatus("Preparing your opponent…");
      setReady(true);
      launch=setTimeout(()=>{if(alive)play.current();},1200);
    }).catch(e=>{if(alive){setStatus(e.message);setFailed(true);}});
    return ()=>{alive=false;clearInterval(interval);if(launch)clearTimeout(launch);animation.stop();};
  },[rotation]);
  return <View style={s.root}>
    <Image source={venueArt[venue.id]} style={[StyleSheet.absoluteFill,{width:"100%",height:"100%",opacity:.16}]} blurRadius={8}/>
    <Text style={s.eyebrow}>{venue.name.toUpperCase()} · ◉ {venue.entry}</Text>
    <Text style={s.title}>Your next challenger</Text>
    <View style={s.duel}>
      <View style={s.player}><Image source={portraits[player.avatar % portraits.length]} style={s.avatar}/><Text style={s.name}>{player.name}</Text><Text style={s.copy}>{player.stats.cpuWins||0} wins · {player.stats.cpuLosses||0} losses</Text></View>
      <View style={{alignItems:"center",gap:10}}><Animated.View style={[s.ring,{transform:[{rotate:rotation.interpolate({inputRange:[0,1],outputRange:["0deg","360deg"]})}]}]}/><Text style={s.eyebrow}>VS</Text></View>
      <View style={s.player}><View style={[s.avatar,{alignItems:"center",justifyContent:"center",backgroundColor:"#214455"}]}><Text style={{fontSize:24,color:"#66e5da",fontWeight:"800"}}>?</Text></View><Text style={s.name}>Opponent</Text><Text style={s.copy}>Getting ready</Text></View>
    </View>
    <Text accessibilityLiveRegion="polite" style={s.status}>{error || status}</Text>
    {!failed && !error && !busy && !ready && <Text style={s.copy}>Connection check · up to {seconds}s remaining</Text>}
    {(failed||!!error) && <Text style={s.copy}>Return to venues to retry or recover an interrupted match.</Text>}
    <Pressable accessibilityRole="button" accessibilityLabel="Cancel opponent search" disabled={busy} onPress={onCancel} style={[s.cancel,busy&&{opacity:.4}]}><Text style={s.name}>{busy?"Opening match…":"Cancel"}</Text></Pressable>
  </View>;
}
const s=StyleSheet.create({root:{flex:1,backgroundColor:"#081e30",alignItems:"center",justifyContent:"center",gap:12,padding:18},eyebrow:{color:"#ffd05b",fontSize:12,fontWeight:"800",letterSpacing:2},title:{color:"#f4f5eb",fontSize:26,fontWeight:"800"},duel:{flexDirection:"row",alignItems:"center",gap:36,marginVertical:10},player:{width:175,alignItems:"center",gap:8},avatar:{width:64,height:64,borderRadius:32,borderWidth:2,borderColor:"#70d8c9"},name:{fontSize:15,color:"#f0f4f8",fontWeight:"700"},copy:{fontSize:11,color:"#c0dbe4",textAlign:"center"},ring:{width:35,height:35,borderRadius:18,borderWidth:3,borderColor:"#284e5e",borderTopColor:"#ffd05b"},status:{fontSize:13,color:"#eff6fc",textAlign:"center",maxWidth:450},cancel:{paddingVertical:12,paddingHorizontal:36,borderWidth:1,borderColor:"#6c8792",borderRadius:20}});
