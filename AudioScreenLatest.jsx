import React, { useEffect, useState, useLayoutEffect, useRef } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Alert,
  Pressable,
  ActivityIndicator,
  Platform,
} from "react-native";
import { Audio } from "expo-av";
import Waveform from "./Waveform";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Image } from "react-native";
import getApiHook from "../ApiHooks/GetApiHook";
const GLOBAL = require("../Helper/Globals");
import axios from "axios";
import usePostApiHook from "../ApiHooks/usePostApiHook";
import Globals from "../Helper/Globals";
import Pusher from "pusher-js";
import { FontAwesome5 } from "@expo/vector-icons";
import { FFmpegKit } from "ffmpeg-kit-react-native";
import * as FileSystem from "expo-file-system";
import AsyncStorage from "@react-native-async-storage/async-storage";

export default function VoiceScreen({ route, navigation }) {
  const [recording, setRecording] = useState();
  const [isRecording, setIsRecording] = useState(false);
  const [messages, setMessages] = useState([]);
  const [sound, setSound] = useState();
  const time = useRef();
  const [status, setStatus] = useState();
  const [permission, setPermission] = useState();
  const routeData = route.params.data;
  let currentIndex = useRef();
  let loadingAudio = useRef();

  const markReadUrl =
    GLOBAL.BASE_URL + "chatgroups/markread/" + routeData.groupId;
  const url = GLOBAL.BASE_URL + "chatgroups/" + routeData.groupId + "/20/0";

  const { data, loading, error, getData } = getApiHook();
  const { response, loadingPost, reqStatus, postData } = usePostApiHook();
  const {
    data: markReadData,
    loading: markReadLoading,
    error: markReadError,
    getData: markRead,
  } = getApiHook();

  /* //old function to load the clips
  const loadClips = async (messageId) => {
    const audio = new Audio.Sound();

    console.log("loading the audio....", messageId);
    console.log("Token....", global.userData.token);

    audio.setOnPlaybackStatusUpdate(onPlaybackUpdate);
    await audio
      .loadAsync(
        {
          uri: GLOBAL.BASE_URL + "messages/" + messageId,
          headers: {
            Authorization: global.userData.token,
          },
        },
        {
          shouldPlay: false,
          volume: 1,
        }
      )
      .then(async (status) => {
        setStatus(status);
        console.log("loaded the audio....");

        await audio
          .getStatusAsync()
          .then((result) => {
            console.log("duration is: ", getDurationFormatted(result.durationMillis));
            setMessages((prev) =>
              prev.map((item) => {
                if (item.messageId === messageId) {
                  return {
                    ...item,
                    sound: audio,
                    loading: false,
                    play: true,
                    milliseconds: result.durationMillis,
                    duration: getDurationFormatted(result.durationMillis),
                  };
                } else {
                  return item;
                }
              })
            );
            loadingAudio.current = false;
            setSound(audio);
          })
          .catch((e) => {
            console.log("error in status: ", e);
          });
      })
      .catch((error) => {
        console.log("error occured", error);
      });
  }; */

  //trying to download the audio first if it donot exist
  const loadClipsNew = async (messageId) => {
    const audio = new Audio.Sound();

    console.log("loading the audio....", messageId);
    console.log("Token....", global.userData.token);

    //this uri is the endpoint of the server from where we can get our file
    //if it donot exist in our local storage
    const uri = GLOBAL.BASE_URL + "messages/" + messageId;

    //this is the local uri of the file if it exists at this address we will retrieve it
    //otherwise we will download the file at this address
    const directoryUri = FileSystem.documentDirectory + `${routeData.groupId}/`;
    const fileUri =
      directoryUri + `${messageId}_${global.userData.languageId}.wav`;

    //we will check if the audio exist in the local storage or not
    //getInfoAsync function is returns two boolean values
    //if the file exists in the local storage the 'exists' is true otherwise it returns false
    //if the directory for this group id is not created yet 'isDirectory' returns false
    const { isDirectory: isDirectory } = await FileSystem.getInfoAsync(
      directoryUri
    );
    //if the directory donot exist create the directory in the local storage
    if (!isDirectory) {
      console.log(">>>Directory donot exist so creating it");
      await FileSystem.makeDirectoryAsync(directoryUri);
    }

    const { exists: exists } = await FileSystem.getInfoAsync(fileUri);
    //if the file donot exist in the local storage we will download it from the server first
    if (!exists) {
      console.log(">>>The file donot exist so downloading it");
      /* we can pass some options for the download, in our case we want to pass authorization token in
      the header of our get request */
      const downloadOptions = {
        headers: {
          Authorization: global.userData.token,
        },
      };

      /* make a resumable download object (first parameter: uri of the server endoint, 
      second parameter: uri of the local file where we want to store the file, 
      third parameter: our download options  ) */
      const downloadResumable = FileSystem.createDownloadResumable(
        uri,
        fileUri,
        downloadOptions
      );

      try {
        //download the file
        //it will return the path of the file in 'uri'
        const { uri } = await downloadResumable.downloadAsync();
        console.log("Finished downloading to ", uri);
      } catch (e) {
        console.error(e);
      }
    }

    //then we will load the audio from our local storage and play it
    audio.setOnPlaybackStatusUpdate(onPlaybackUpdate);
    await audio
      .loadAsync(
        {
          uri: fileUri,
        },
        {
          shouldPlay: false,
          volume: 1,
        }
      )
      .then(async (status) => {
        setStatus(status);
        console.log("loaded the audio....");

        await audio
          .getStatusAsync()
          .then((result) => {
            console.log(
              "duration is: ",
              getDurationFormatted(result.durationMillis)
            );
            setMessages((prev) =>
              prev.map((item) => {
                if (item.messageId === messageId) {
                  return {
                    ...item,
                    sound: audio,
                    loading: false,
                    play: true,
                    milliseconds: result.durationMillis,
                    duration: getDurationFormatted(result.durationMillis),
                  };
                } else {
                  return item;
                }
              })
            );
            loadingAudio.current = false;
            setSound(audio);
          })
          .catch((e) => {
            console.log("error in status: ", e);
          });
      })
      .catch((error) => {
        console.log("error occured", error);
      });
  };

  //useEffect for permission
  useEffect(() => {
    getPermission();
  }, []);

  async function getPermission() {
    let permission = await AsyncStorage.getItem("permission");
    permission = JSON.parse(permission);
    console.log("Permission is", permission);

    if (permission?.granted) {
      console.log("Permission Already Granted!");
      setPermission(permission);
      return;
    }

    console.log("Requesting Permission");
    const perm = await Audio.requestPermissionsAsync();
    if (perm.granted) {
      setPermission(perm);
      console.log("Permission Granted!");
      await AsyncStorage.setItem("permission", JSON.stringify(perm));
    }
  }

  //useEffect for pusher
  useEffect(() => {
    /* Pusher.log = (msg) => {
      console.log("Pusher log:", msg);
    }; */

    let pusher = undefined;
    try {
      let id = routeData.groupId;
      console.log("Check Group ID", id);
      pusher = new Pusher("bff5058d89d1b8f2490b", {
        cluster: "mt1",
      });
      const channel = pusher.subscribe("chat-channel");
      channel.bind("message-" + id, function (data) {
        console.log("Bind data: ", data);
        // console.log("*****Sender: ", data.sender);
        // console.log("*****Global:", global.userData);
        getChatData();
      });
    } catch (error) {
      console.log(error);
    }

    return () => {
      if (pusher != undefined) {
        pusher.unsubscribe("chat-channel");
        console.log("pusher chat channel unsubscribed!");
      }
    };
  }, []);

  useEffect(() => {
    if (sound) {
      playSound();
    }

    return async () => {
      if (sound) {
        await sound.pauseAsync();
        await sound.unloadAsync();
      }
    };
  }, [sound]);

  async function playSound() {
    await sound.playAsync();
  }

  async function stopSound() {
    await sound.pauseAsync();
    await sound.unloadAsync();
    setSound(undefined);
  }

  function getChatData() {
    global.userData?.token ? getData(url, global.userData.token) : "";
  }

  useEffect(() => {
    console.log("STUBS");
    const unSubs = [
      navigation.addListener("focus", () => {
        console.log("API could be called from Here or not ?");
        getChatData();
        console.log("New Data is =", data);
      }),
    ];

    return function cleanUp() {
      unSubs.forEach((unSub) => {
        unSub();
      });
    };
  }, [navigation]);

  useEffect(() => {
    return () => {
      if (sound) sound.unloadAsync();
      //if (time.current) clearInterval(time.current);
    };
  }, []);

  useEffect(() => {
    // var modelArray = []
    if (data) {
      //console.log("data.messages==", data);
      // Displays the bubbles
      const audioMessages = data.messages
        .filter((message) => {
          return message.messageType == "AUDIO";
        })
        .map((message) => ({
          messageId: message.messageId,
          sound: "",
          milliseconds: "",
          duration: "",
          file: "",
          play: false,
          sent: message.isSender,
          loading: false,
          time: getTime(message.timestamp),
        }));
      setMessages(audioMessages.reverse());
      global.userData?.token
        ? markRead(markReadUrl, global.userData.token)
        : "";
    }
  }, [data]);

  useLayoutEffect(() => {
    console.log("data =", routeData);
    navigation.setOptions({
      title: routeData.username,
      headerLeft: () => (
        <TouchableOpacity
          style={{ marginRight: 20 }}
          onPress={() => navigation.pop()}
        >
          <MaterialCommunityIcons
            name="chevron-left"
            color={"white"}
            size={30}
          />
        </TouchableOpacity>
      ),
      headerRight: () => (
        <View
          style={{
            marginRight: 10,
            // backgroundColor: 'blue',
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <TouchableOpacity
            style={{
              // backgroundColor: 'blue',
              alignItems: "center",
              justifyContent: "center",
            }}
            onPress={() => navigation.pop()}
          >
            {/* <MaterialCommunityIcons
						name='call-received'
						color={'white'}
						size={30}
					/> */}

            <Image
              style={{ width: 25, height: 25, marginBottom: 3 }}
              source={require("../../assets/icons/call-for-chat-icon.png")}
            />
            <Text style={{ color: "white", fontSize: 12, fontWeight: "bold" }}>
              Calls
            </Text>
          </TouchableOpacity>
        </View>
      ),
    });
  }, [navigation]);

  async function startRecording() {
    if (permission && permission.granted) {
      try {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
        });

        const { recording } = await Audio.Recording.createAsync({
          isMeteringEnabled: true,
          android: {
            extension: ".m4a",
            outputFormat: Audio.AndroidOutputFormat.MPEG_4,
            audioEncoder: Audio.AndroidAudioEncoder.AAC,
            sampleRate: 16000,
            numberOfChannels: 1,
            bitRate: 128000,
          },
          ios: {
            extension: ".wav",
            outputFormat: Audio.IOSOutputFormat.LINEARPCM,
            audioQuality: Audio.IOSAudioQuality.MAX,
            sampleRate: 16000,
            numberOfChannels: 1,
            bitRate: 128000,
            linearPCMBitDepth: 16,
            linearPCMIsBigEndian: false,
            linearPCMIsFloat: false,
          },
          web: {
            mimeType: "audio/webm",
            bitsPerSecond: 128000,
          },
        });

        setIsRecording(true);
        setRecording(recording);
      } catch (err) {
        console.log("Failed to start recording", err.message);
        if (err.message === "Missing audio recording permissions.") {
          console.log("Requesting Permissions again");
          await AsyncStorage.setItem("permission", "false");
          getPermission();
        }
        return;
      }
    } else {
      Alert.alert("Please grant permission to app to access microphone");
    }
  }

  async function stopRecording() {
    if (!recording) return;

    console.log("Recording is stopped");
    setIsRecording(false);
    setRecording(undefined);
    await recording.stopAndUnloadAsync();

    let newMessages = [...messages];
    const { sound, status } = await recording.createNewLoadedSoundAsync();
    let length = newMessages.unshift({
      milliseconds: status.durationMillis,
      sound: undefined,
      duration: "",
      file: recording.getURI(),
      play: false,
      sent: true,
      loading: true,
      time: getTime(new Date()),
    });

    setMessages(newMessages);

    let recordingIndex = 0;

    let uri = recording.getURI();
    let fileType = uri.split(".").pop();
    let fileName = uri.split("/").pop();

    let cache = uri.slice(0, uri.length - fileType.length);

    let outputFileExt = "wav";
    let output = cache + outputFileExt;
    let outputFileName = output.split("/").pop();

    console.log("FileName: ", outputFileName);
    console.log("FileType: ", outputFileExt);
    console.log("uri: ", output);

    if (Platform.OS === "android") {
      await FFmpegKit.execute(`-i ${uri} -c:a pcm_s16le ${output}`).then(
        async (session) => {
          const output = session.getOutput();
        }
      );
    }

    axios
      .get("http://live.lingmo-api.com/v1/Token/Get/LingmoTranslate")
      .then((res) => {
        let token = res.data.Token;

        let formData = new FormData();
        formData.append("file", {
          uri: output,
          type: "audio/" + outputFileExt,
          name: outputFileName,
        });
        formData.append("sampleRate", 16000);
        formData.append("targetLang", global.userData.languageId);

        axios({
          method: "post",
          url: "http://live.lingmo-api.com/v1/SpeechToText/GetByPostedFile",
          headers: {
            Authorization: token,
            "Content-Type": "multipart/form-data",
          },
          data: formData,
        }).then((response) => {
          console.log(response.data.ResponseText);

          let params = new FormData();
          params.append("file", {
            uri: output,
            type: "audio/" + outputFileExt,
            name: outputFileName,
          });
          params.append("groupId", routeData.groupId);
          params.append("Text", response.data.ResponseText);
          params.append("authToken", global.userData.token);
          params.append("language", global.userData.languageId);
          params.append("Original", outputFileName);

          console.log(JSON.stringify(params, null, 2));

          axios({
            method: "post",
            url: Globals.BASE_URL + "filesend",
            headers: {
              "Content-Type": "multipart/form-data",
            },
            data: params,
          })
            .then(async (response) => {
              let resp = JSON.parse(response.request._response);
              console.log(resp);
              newMessages[recordingIndex].messageId = resp.data;
              newMessages[recordingIndex].loading = false;
              currentIndex.current = recordingIndex;
              setMessages(newMessages);
              // await loadClips(resp.data);
            })
            .catch((error) => console.log(error));
        });
      })
      .catch((e) => console.log(e));
  }

  function getTime(receivedDate) {
    let time = new Date(receivedDate);
    let hours = time.getHours();
    let minutes = time.getMinutes();
    let ampm = hours >= 12 ? "pm" : "am";
    hours = hours % 12;
    hours = hours ? hours : 12; // the hour '0' should be '12'
    minutes = minutes < 10 ? "0" + minutes : minutes;
    hours = hours < 10 ? "0" + hours : hours;
    let timeString = hours + ":" + minutes + " " + ampm;
    return timeString;
  }

  function getDurationFormatted(millis) {
    const minutes = millis / 1000 / 60;
    const minutesDisplay = Math.floor(minutes);
    const seconds = Math.round((minutes - minutesDisplay) * 60);
    const secondsDisplay = seconds < 10 ? `0${seconds}` : seconds;
    return `${minutesDisplay}:${secondsDisplay}`;
  }

  // async function playAudio(item, index) {
  //   if (item.play) {
  //     changePlayValue(index);
  //     play(item, index);
  //   } else {
  //     changeToLoading(index);
  //     await loadClips(item.messageId, item, index);
  //   }
  // }

  async function playAudio(item, index) {
    if (index === -1 || loadingAudio.current) return;

    if (!sound) {
      changeToLoading(index, true);
      currentIndex.current = index;
      loadingAudio.current = true;
      const audio = new Audio.Sound();

      await loadClipsNew(item.messageId, index);
      console.log("Playing for the first time");
      return;
    }

    console.log(`Current: ${currentIndex.current} Index: ${index}`);

    if (status.isLoaded && currentIndex.current === index) {
      console.log("Already playing");
      stopSound();
      changePlayValue(index, false);
      //clearTimeout(time.current);
    }
  }

  async function onPlaybackUpdate(playbackStatus) {
    if (playbackStatus.isLoaded) {
      if (playbackStatus.didJustFinish) {
        changePlayValue(currentIndex.current, false);
        changeToLoading(currentIndex.current, false);
        // sound.unloadAsync();
        setSound(undefined);
        playAudio(messages[currentIndex.current - 1], currentIndex.current - 1);
      }
    }
  }

  // async function play(item, index) {
  //   if (item.play) {
  //     await item.sound.playAsync();
  //   } else {
  //     await item.sound.pauseAsync();
  //     await item.sound.unloadAsync();
  //     return;
  //   }

  //   console.log("Millis: ", item.milliseconds);

  //   setTimeout(async () => {
  //     if (item.play) {
  //       changePlayValue(index);
  //       await item.sound.unloadAsync();
  //     }
  //   }, item.milliseconds);
  // }

  function changePlayValue(index, value) {
    let newArray = messages;
    newArray[index].play = value;
    setMessages([...newArray]);
  }

  function changeToLoading(index, value) {
    let newArray = messages;
    newArray[index].loading = value;
    setMessages([...newArray]);
  }

  return (
    <View style={{ backgroundColor: "#0060f7", flex: 1 }}>
      {isRecording ? (
        <View
          style={{
            position: "absolute",
            width: "100%",
            height: "60%",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 5,
          }}
        >
          <View
            style={{
              backgroundColor: "#0060f7",
              width: "70%",
              height: "55%",
              justifyContent: "center",
              alignItems: "center",
              borderRadius: 250,
            }}
          >
            <FontAwesome5 name="microphone" size={100} color="white" />
            <Image
              style={{ width: 200, height: 30, marginTop: 20 }}
              source={require("../../assets/icons/microphone.gif")}
            />
          </View>
        </View>
      ) : null}
      <View
        style={{
          backgroundColor: "#eff3ff",
          padding: 10,
          paddingBottom: 0,
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          flex: 0.85,
        }}
      >
        <Text
          style={{ color: "lightgrey", textAlign: "center", marginBottom: 10 }}
        >
          Today
        </Text>
        <FlatList
          data={messages}
          extraData={messages}
          inverted
          showsVerticalScrollIndicator={false}
          renderItem={({ item, index }) => {
            return (
              <View
                style={{
                  alignItems: item.sent ? "flex-end" : "flex-start",
                  marginBottom: 10,
                  marginLeft: item.sent ? 0 : 15,
                  marginRight: item.sent ? 15 : 0,
                }}
              >
                <View
                  style={{
                    width: 250,
                    backgroundColor: item.sent ? "#0060f7" : "white",
                    borderTopRightRadius: item.sent ? 0 : 10,
                    borderTopLeftRadius: item.sent ? 10 : 0,
                    borderRadius: 10,
                    alignItems: "center",
                    padding: 8,
                    flexDirection: "row",
                    justifyContent: "space-between",
                  }}
                >
                  <View style={{ flex: 0.15 }}>
                    {item.loading ? (
                      <View>
                        <ActivityIndicator size="large" />
                      </View>
                    ) : (
                      <TouchableOpacity onPress={() => playAudio(item, index)}>
                        <MaterialCommunityIcons
                          name={item.play ? "pause" : "play"}
                          color={item.sent ? "white" : "#0060f7"}
                          size={40}
                        />
                      </TouchableOpacity>
                    )}
                  </View>
                  <View style={{ flex: 0.85 }}>
                    <View
                      style={{ flex: 1, marginBottom: 3, alignItems: "center" }}
                    >
                      <Waveform />
                    </View>
                    <View
                      style={{
                        flex: 1,
                        alignItems: "center",
                      }}
                    >
                      <View
                        style={{
                          width: "90%",
                          flexDirection: "row",
                          justifyContent: "space-between",
                        }}
                      >
                        <Text
                          style={{
                            color: item.sent ? "lightgrey" : "grey",
                            fontWeight: "bold",
                            fontSize: 12,
                          }}
                        >
                          {item.duration}
                        </Text>
                        <Text
                          style={{
                            color: item.sent ? "lightgrey" : "grey",
                            fontWeight: "bold",
                            fontSize: 12,
                          }}
                        >
                          {item.time}
                        </Text>
                      </View>
                    </View>
                  </View>
                </View>
                <View
                  style={[
                    item.sent
                      ? {
                          width: 0,
                          height: 0,
                          borderTopWidth: 0,
                          borderBottomWidth: 15,
                          borderLeftWidth: 20,

                          borderStyle: "solid",
                          backgroundColor: "transparent",
                          borderTopColor: "transparent",
                          borderBottomColor: "transparent",
                          borderLeftColor: "#0060f7",
                          position: "absolute",
                          top: 0,
                          right: -15,
                          zIndex: 10,
                          borderTopRightRadius: 0,
                        }
                      : {
                          width: 0,
                          height: 0,
                          borderTopWidth: 0,
                          borderBottomWidth: 15,
                          borderRightWidth: 20,

                          borderStyle: "solid",
                          backgroundColor: "transparent",
                          borderTopColor: "transparent",
                          borderBottomColor: "transparent",
                          borderRightColor: "white",
                          position: "absolute",
                          top: 0,
                          left: -15,
                          zIndex: 10,
                          borderTopRightRadius: 0,
                        },
                  ]}
                ></View>
              </View>
            );
          }}
        />
      </View>
      <View style={{ flex: 0.15, backgroundColor: "#eff3ff" }}>
        <View
          style={{
            flex: 1,
            backgroundColor: "#0060f7",
            padding: 20,
            justifyContent: "center",
            alignItems: "center",
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
          }}
        >
          <Pressable
            style={({ pressed }) => ({
              backgroundColor: "#e1bc1e",
              padding: 15,
              paddingHorizontal: 25,
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              borderRadius: 50,
              opacity: pressed ? 0.7 : 1,
            })}
            onPressIn={startRecording}
            onPressOut={stopRecording}
          >
            {isRecording ? (
              <FontAwesome5 name="microphone" size={35} color="white" />
            ) : (
              <Image
                source={require("../../assets/icons/call-for-chat-icon.png")}
                style={{ width: 35, height: 35 }}
              />
            )}
            <Text
              style={{
                fontSize: 18,
                fontWeight: "bold",
                color: "white",
                fontSize: 20,
                marginLeft: 15,
              }}
            >
              Push to Talk
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
