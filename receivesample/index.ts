
import { mqtt, iot, auth } from "aws-iot-device-sdk-v2";
import * as AWS from "aws-sdk";

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { VRMLoaderPlugin, VRMUtils, VRMHumanBoneName } from '@pixiv/three-vrm';
import { float } from "aws-sdk/clients/lightsail";

const Settings = require("./settings");

// vrm
let currentVrm: any = undefined;

function log(msg: string) {
  //$("#console").append(`<pre>${msg}</pre>`);
  //console.log(msg)
}


/**
* AWSCognitoCredentialOptions. The credentials options used to create AWSCongnitoCredentialProvider.
*/
interface AWSCognitoCredentialOptions
{
  IdentityPoolId : string,
  Region: string
}

/**
* AWSCognitoCredentialsProvider. The AWSCognitoCredentialsProvider implements AWS.CognitoIdentityCredentials.
*
*/
export class AWSCognitoCredentialsProvider extends auth.CredentialsProvider{
  private options: AWSCognitoCredentialOptions;
  private source_provider : AWS.CognitoIdentityCredentials;
  private aws_credentials : auth.AWSCredentials;
  constructor(options: AWSCognitoCredentialOptions, expire_interval_in_ms? : number)
  {
    super();
    this.options = options;
    AWS.config.region = options.Region;
    this.source_provider = new AWS.CognitoIdentityCredentials({
        IdentityPoolId: options.IdentityPoolId
    });
    this.aws_credentials = 
    {
        aws_region: options.Region,
        aws_access_id : this.source_provider.accessKeyId,
        aws_secret_key: this.source_provider.secretAccessKey,
        aws_sts_token: this.source_provider.sessionToken
    }

    setInterval(async ()=>{
        await this.refreshCredentialAsync();
    },expire_interval_in_ms?? 3600*1000);
  }

  getCredentials(){
      return this.aws_credentials;
  }

  async refreshCredentialAsync()
  {
    return new Promise<AWSCognitoCredentialsProvider>((resolve, reject) => {
        this.source_provider.get((err)=>{
            if(err)
            {
                reject("Failed to get cognito credentials.")
            }
            else
            {
                this.aws_credentials.aws_access_id = this.source_provider.accessKeyId;
                this.aws_credentials.aws_secret_key = this.source_provider.secretAccessKey;
                this.aws_credentials.aws_sts_token = this.source_provider.sessionToken;
                this.aws_credentials.aws_region = this.options.Region;
                resolve(this);
            }
        });
    });
  }
}

async function connect_websocket(provider: auth.CredentialsProvider) {
  return new Promise<mqtt.MqttClientConnection>((resolve, reject) => {
    let config = iot.AwsIotMqttConnectionConfigBuilder.new_builder_for_websocket()
        .with_clean_session(true)
        .with_client_id(`pub_sub_sample(${new Date()})`)
        .with_endpoint(Settings.AWS_IOT_ENDPOINT)
        .with_credential_provider(provider)
        .with_use_websockets()
        .with_keep_alive_seconds(30)
        .build();

    log("Connecting websocket...");
    const client = new mqtt.MqttClient();

    const connection = client.new_connection(config);
    connection.on("connect", (session_present) => {
      resolve(connection);
    });
    connection.on("interrupt", (error) => {
      log(`Connection interrupted: error=${error}`);
    });
    connection.on("resume", (return_code, session_present) => {
      log(`Resumed: rc: ${return_code} existing session: ${session_present}`);
    });
    connection.on("disconnect", () => {
      log("Disconnected");
    });
    connection.on("error", (error) => {
      reject(error);
    });
    connection.connect();
  });
}

async function connectiot() {
  /** Set up the credentialsProvider */
  const provider = new AWSCognitoCredentialsProvider({
          IdentityPoolId: Settings.AWS_COGNITO_IDENTITY_POOL_ID, 
          Region: Settings.AWS_REGION});
  /** Make sure the credential provider fetched before setup the connection */
  await provider.refreshCredentialAsync();

  connect_websocket(provider)
  .then((connection) => {
      connection
        .subscribe(
          "/VMC/#",
          mqtt.QoS.AtLeastOnce,
          (topic, payload, dup, qos, retain) => {
            const decoder = new TextDecoder("utf8");
            let message = decoder.decode(new Uint8Array(payload));

            updateVRM(topic, message);
          }
        )
        .then((subscription) => {
          log(`subscribe ok`)
        });
    })
    .catch((reason) => {
      log(`Error while connecting: ${reason}`);
    });
}



/**
*  Three.js + VRM
*/
function changeBone(node: any,
  posX: any, posY: any, posZ: any,
  rotX: any, rotY: any, rotZ: any, rotW: any) {

	currentVrm.humanoid.getNormalizedBoneNode( node ).position.x = posX;
	currentVrm.humanoid.getNormalizedBoneNode( node ).position.y = posY;
	currentVrm.humanoid.getNormalizedBoneNode( node ).position.z = posZ;
	currentVrm.humanoid.getNormalizedBoneNode( node ).quaternion.x = rotX;
	currentVrm.humanoid.getNormalizedBoneNode( node ).quaternion.y = rotY;
	currentVrm.humanoid.getNormalizedBoneNode( node ).quaternion.z = rotZ;
	currentVrm.humanoid.getNormalizedBoneNode( node ).quaternion.w = rotW;
}


function getAngelFromQuaternion(w:float) {
  // https://stackoverflow.com/questions/62457529/how-do-you-get-the-axis-and-angle-representation-of-a-quaternion-in-three-js
  return 2 * Math.acos(w);
}

function getAxisFromQuaternion(angle: number, x: float, y: float, z:float, w:float) {
  const axis = [0.0, 0.0, 0.0];
  //const s = Math.sin(angle / 2);
  const s = Math.sqrt(1 - w * w);

  if (1 - w * w < 0.000001) {
    axis[0] = x;
    axis[1] = y;
    axis[2] = z;
  } else {
    axis[0] = x / s;
    axis[1] = y / s;
    axis[2] = z / s;
  }

  return  new THREE.Vector3(axis[0], axis[1], axis[2]).normalize()
}



function changeBoneFromValue(value: string) {
  let bone, posX, posY, posZ, rotX, rotY, rotZ, rotW;
  [bone, posX, posY, posZ, rotX, rotY, rotZ, rotW] = value.split(" ");

  posX = parseFloat(posX)
  posY = parseFloat(posY)
  posZ = parseFloat(posZ)
  rotX = parseFloat(rotX)
  rotY = parseFloat(rotY)
  rotZ = parseFloat(rotZ)
  rotW = parseFloat(rotW)

  // 座標軸の調整をする
  posZ = -1 * posZ;

  // そのまま
  let quaternion = new THREE.Quaternion();
  quaternion.fromArray([rotX, rotY, rotZ, rotW]);

  //// オイラー角に一度変換する
  //let qf = new THREE.Quaternion();
  //qf.fromArray([rotX, rotY, rotZ, rotW]);
  //const e = new THREE.Euler().setFromQuaternion(qf)
  //const quaternion = new THREE.Quaternion();
  //quaternion.setFromEuler(e);

  let angle = getAngelFromQuaternion(quaternion.w);
  let axis = getAxisFromQuaternion(angle, quaternion.x, quaternion.y, quaternion.z, quaternion.w);

  // クォータニオンを逆回転
  let target = new THREE.Quaternion();
  let revQ = target.setFromAxisAngle(new THREE.Vector3(axis.x, axis.y, -1 * axis.z), -1 * angle);

  rotX = revQ.x;
  rotY = revQ.y;
  rotZ = revQ.z;
  rotW = revQ.w;

  switch (bone) {
    case "Hips":
      changeBone(VRMHumanBoneName.Hips, posX, posY, posZ, rotX, rotY, rotZ, rotW);
      break
    case "LeftUpperLeg":
      changeBone(VRMHumanBoneName.LeftUpperLeg, posX, posY, posZ, rotX, rotY, rotZ, rotW);
      break
    case "RightUpperLeg":
      changeBone(VRMHumanBoneName.RightUpperLeg, posX, posY, posZ, rotX, rotY, rotZ, rotW);
      break
    case "LeftLowerLeg":
      changeBone(VRMHumanBoneName.LeftLowerLeg, posX, posY, posZ, rotX, rotY, rotZ, rotW);
      break
    case "RightLowerLeg":
      changeBone(VRMHumanBoneName.RightLowerLeg, posX, posY, posZ, rotX, rotY, rotZ, rotW);
      break
    case "LeftFoot":
      changeBone(VRMHumanBoneName.LeftFoot, posX, posY, posZ, rotX, rotY, rotZ, rotW);
      break
    case "RightFoot":
      changeBone(VRMHumanBoneName.RightFoot, posX, posY, posZ, rotX, rotY, rotZ, rotW);
      break
    case "Spine":
      changeBone(VRMHumanBoneName.Spine, posX, posY, posZ, rotX, rotY, rotZ, rotW);
      break
    case "Chest":
      changeBone(VRMHumanBoneName.Chest, posX, posY, posZ, rotX, rotY, rotZ, rotW);
      break
    case "Neck":
      changeBone(VRMHumanBoneName.Neck, posX, posY, posZ, rotX, rotY, rotZ, rotW);
      break
    case "Head":
      changeBone(VRMHumanBoneName.Head, posX, posY, posZ, rotX, rotY, rotZ, rotW);
      break
    case "LeftShoulder":
      changeBone(VRMHumanBoneName.LeftShoulder, posX, posY, posZ, rotX, rotY, rotZ, rotW);
      break
    case "RightShoulder":
      changeBone(VRMHumanBoneName.RightShoulder, posX, posY, posZ, rotX, rotY, rotZ, rotW);
      break
    case "LeftUpperArm":
      changeBone(VRMHumanBoneName.LeftUpperArm, posX, posY, posZ, rotX, rotY, rotZ, rotW);
      break
    case "RightUpperArm":
      changeBone(VRMHumanBoneName.RightUpperArm, posX, posY, posZ, rotX, rotY, rotZ, rotW);
      break
    case "LeftLowerArm":
      changeBone(VRMHumanBoneName.LeftLowerArm, posX, posY, posZ, rotX, rotY, rotZ, rotW);
      break
    case "RightLowerArm":
      changeBone(VRMHumanBoneName.RightLowerArm, posX, posY, posZ, rotX, rotY, rotZ, rotW);
      break
    case "LeftHand":
      changeBone(VRMHumanBoneName.LeftHand, posX, posY, posZ, rotX, rotY, rotZ, rotW);
      break
    case "RightHand":
      changeBone(VRMHumanBoneName.RightHand, posX, posY, posZ, rotX, rotY, rotZ, rotW);
      break
    case "LeftToes":
      changeBone(VRMHumanBoneName.LeftToes, posX, posY, posZ, rotX, rotY, rotZ, rotW);
      break
    case "RightToes":
      changeBone(VRMHumanBoneName.RightToes, posX, posY, posZ, rotX, rotY, rotZ, rotW);
      break
    case "LeftEye":
      changeBone(VRMHumanBoneName.LeftEye, posX, posY, posZ, rotX, rotY, rotZ, rotW);
      break
    case "RightEye":
      changeBone(VRMHumanBoneName.RightEye, posX, posY, posZ, rotX, rotY, rotZ, rotW);
      break
    case "Jaw":
      changeBone(VRMHumanBoneName.Jaw, posX, posY, posZ, rotX, rotY, rotZ, rotW);
      break
    case "LeftThumbProximal":
      changeBone(VRMHumanBoneName.LeftThumbProximal, posX, posY, posZ, rotX, rotY, rotZ, rotW);
      break
    case "LeftThumbIntermediate":
      // no name
      break
    case "LeftThumbDistal":
      changeBone(VRMHumanBoneName.LeftThumbDistal, posX, posY, posZ, rotX, rotY, rotZ, rotW);
      break
    case "LeftIndexProximal":
      changeBone(VRMHumanBoneName.LeftIndexProximal, posX, posY, posZ, rotX, rotY, rotZ, rotW);
      break
    case "LeftIndexIntermediate":
      changeBone(VRMHumanBoneName.LeftIndexIntermediate, posX, posY, posZ, rotX, rotY, rotZ, rotW);
      break
    case "LeftIndexDistal":
      changeBone(VRMHumanBoneName.LeftIndexDistal, posX, posY, posZ, rotX, rotY, rotZ, rotW);
      break
    case "LeftMiddleProximal":
      changeBone(VRMHumanBoneName.LeftMiddleProximal, posX, posY, posZ, rotX, rotY, rotZ, rotW);
      break
    case "LeftMiddleIntermediate":
      changeBone(VRMHumanBoneName.LeftMiddleIntermediate, posX, posY, posZ, rotX, rotY, rotZ, rotW);
      break
    case "LeftMiddleDistal":
      changeBone(VRMHumanBoneName.LeftMiddleDistal, posX, posY, posZ, rotX, rotY, rotZ, rotW);
      break
    case "LeftRingProximal":
      changeBone(VRMHumanBoneName.LeftRingProximal, posX, posY, posZ, rotX, rotY, rotZ, rotW);
      break
    case "LeftRingIntermediate":
      changeBone(VRMHumanBoneName.LeftRingIntermediate, posX, posY, posZ, rotX, rotY, rotZ, rotW);
      break
    case "LeftRingDistal":
      changeBone(VRMHumanBoneName.LeftRingDistal, posX, posY, posZ, rotX, rotY, rotZ, rotW);
      break
    case "LeftLittleProximal":
      changeBone(VRMHumanBoneName.LeftLittleProximal, posX, posY, posZ, rotX, rotY, rotZ, rotW);
      break
    case "LeftLittleIntermediate":
      changeBone(VRMHumanBoneName.LeftLittleIntermediate, posX, posY, posZ, rotX, rotY, rotZ, rotW);
      break
    case "LeftLittleDistal":
      changeBone(VRMHumanBoneName.LeftLittleDistal, posX, posY, posZ, rotX, rotY, rotZ, rotW);
      break
    case "RightThumbProximal":
      changeBone(VRMHumanBoneName.RightThumbProximal, posX, posY, posZ, rotX, rotY, rotZ, rotW);
      break
    case "RightThumbIntermediate":
      // TODO: VRMHumanBoneName.RightThumbMetacarpalかもしれない（未確認）
      break
    case "RightThumbDistal":
      changeBone(VRMHumanBoneName.RightThumbDistal, posX, posY, posZ, rotX, rotY, rotZ, rotW);
      break
    case "RightIndexProximal":
      changeBone(VRMHumanBoneName.RightIndexProximal, posX, posY, posZ, rotX, rotY, rotZ, rotW);
      break
    case "RightIndexIntermediate":
      changeBone(VRMHumanBoneName.RightIndexIntermediate, posX, posY, posZ, rotX, rotY, rotZ, rotW);
      break
    case "RightIndexDistal":
      changeBone(VRMHumanBoneName.RightIndexDistal, posX, posY, posZ, rotX, rotY, rotZ, rotW);
      break
    case "RightMiddleProximal":
      changeBone(VRMHumanBoneName.RightMiddleProximal, posX, posY, posZ, rotX, rotY, rotZ, rotW);
      break
    case "RightMiddleIntermediate":
      changeBone(VRMHumanBoneName.RightMiddleIntermediate, posX, posY, posZ, rotX, rotY, rotZ, rotW);
      break
    case "RightMiddleDistal":
      changeBone(VRMHumanBoneName.RightMiddleDistal, posX, posY, posZ, rotX, rotY, rotZ, rotW);
      break
    case "RightRingProximal":
      changeBone(VRMHumanBoneName.RightRingProximal, posX, posY, posZ, rotX, rotY, rotZ, rotW);
      break
    case "RightRingIntermediate":
      changeBone(VRMHumanBoneName.RightRingIntermediate, posX, posY, posZ, rotX, rotY, rotZ, rotW);
      break
    case "RightRingDistal":
      changeBone(VRMHumanBoneName.RightRingDistal, posX, posY, posZ, rotX, rotY, rotZ, rotW);
      break
    case "RightLittleProximal":
      changeBone(VRMHumanBoneName.RightLittleProximal, posX, posY, posZ, rotX, rotY, rotZ, rotW);
      break
    case "RightLittleIntermediate":
      changeBone(VRMHumanBoneName.RightLittleIntermediate, posX, posY, posZ, rotX, rotY, rotZ, rotW);
      break
    case "RightLittleDistal":
      changeBone(VRMHumanBoneName.RightLittleDistal, posX, posY, posZ, rotX, rotY, rotZ, rotW);
      break
    default:
      log("skip bone:" + value);
  }

}

function updateVRM(target: string, values:string) {
	if ( !currentVrm ) {
    log("no vrm loading");
    return;
  }   

  switch (target) {
    case "/VMC/Ext/Bone/Pos":
      values.split("\n ").forEach(
        function(value) {
          changeBoneFromValue(value)
        }
      );

      break
  }
}

// renderer
const renderer = new THREE.WebGLRenderer();
renderer.setSize( window.innerWidth, window.innerHeight );
renderer.setPixelRatio( window.devicePixelRatio );
document.body.appendChild( renderer.domElement );

// camera
const camera = new THREE.PerspectiveCamera( 30.0, window.innerWidth / window.innerHeight, 0.1, 20.0 );
camera.position.set( 0.0, 1.0, 5.0 );

// camera controls
const controls = new OrbitControls( camera, renderer.domElement );
controls.screenSpacePanning = true;
controls.target.set( 0.0, 1.0, 0.0 );
controls.update();

// scene
const scene = new THREE.Scene();

// light
const light = new THREE.DirectionalLight( 0xffffff );
light.position.set( 1.0, 1.0, 1.0 ).normalize();
scene.add( light );

const light1 = new THREE.AmbientLight(0xFFFFFF, 0.5);
scene.add(light1);

// gltf and vrm
const loader = new GLTFLoader()

// Install GLTFLoader plugin
loader.register((parser) => {
  return new VRMLoaderPlugin(parser);
});

loader.crossOrigin = 'anonymous';
loader.load(
	Settings.MODEL_PATH,

	( gltf ) => {

		// calling these functions greatly improves the performance
		VRMUtils.removeUnnecessaryVertices( gltf.scene );
		VRMUtils.removeUnnecessaryJoints( gltf.scene );

    const vrm = gltf.userData.vrm;
    scene.add(vrm.scene);

    log(vrm);

		vrm.springBoneManager.reset();

    VRMUtils.rotateVRM0(vrm);
    currentVrm = vrm;
	},

	// called while loading is progressing
	(progress) => console.log( 'Loading model...', 100.0 * ( progress.loaded / progress.total ), '%' ),

	// called when loading has errors
	(error) => console.error( error )

);

// helpers
const gridHelper = new THREE.GridHelper( 10, 10 );
scene.add( gridHelper );

const axesHelper = new THREE.AxesHelper( 5 );
scene.add( axesHelper );

const clock = new THREE.Clock();

let count = 0;


//function printLocal(bone: any) {
//
//	log(bone + " pos: " + JSON.stringify(currentVrm.humanoid.getNormalizedBoneNode( bone ).position));
//	log(bone + " quat: " + JSON.stringify(currentVrm.humanoid.getNormalizedBoneNode( bone ).quaternion));
//	log(bone + " rot: " + JSON.stringify(currentVrm.humanoid.getNormalizedBoneNode( bone ).rotation));
//
//  const e = new THREE.Euler().setFromQuaternion(currentVrm.humanoid.getNormalizedBoneNode( bone ).quaternion) // オイラー角に変換
//  log(bone + " rot rad: " + JSON.stringify(e))
//  log(bone + " rot: " + THREE.MathUtils.radToDeg(e.x) + " / " + THREE.MathUtils.radToDeg(e.y) + " / " + THREE.MathUtils.radToDeg(e.z))
//
//  // to quaternion
//  const quaternion = new THREE.Quaternion();
//  quaternion.setFromEuler(e);
//	log(bone + " quat: from euler: " + JSON.stringify(quaternion));
//
//
//}


function animate() {
	requestAnimationFrame( animate );

	if ( currentVrm ) {
	  const deltaTime = clock.getDelta();
		currentVrm.update( deltaTime );

    if (count % 100 == 1) {
      //printLocal(VRMHumanBoneName.RightShoulder)
      //printLocal(VRMHumanBoneName.RightUpperArm)
	    //log("rightLowerArm pos: " + JSON.stringify(currentVrm.humanoid.getNormalizedBoneNode( VRMHumanBoneName.RightLowerArm ).position));
	    //log("rightLowerArm quat: " + JSON.stringify(currentVrm.humanoid.getNormalizedBoneNode( VRMHumanBoneName.RightLowerArm ).quaternion));
	    //log("rightHand pos: " + JSON.stringify(currentVrm.humanoid.getNormalizedBoneNode( VRMHumanBoneName.RightHand ).position));
	    //log("rightHand quat: " + JSON.stringify(currentVrm.humanoid.getNormalizedBoneNode( VRMHumanBoneName.RightHand ).quaternion));

	    //currentVrm.humanoid.getNormalizedBoneNode( VRMHumanBoneName.RightShoulder ).quaternion.x = 0;
	    //currentVrm.humanoid.getNormalizedBoneNode( VRMHumanBoneName.RightShoulder ).quaternion.y = 0;
	    //currentVrm.humanoid.getNormalizedBoneNode( VRMHumanBoneName.RightShoulder ).quaternion.z = 0;
	    //currentVrm.humanoid.getNormalizedBoneNode( VRMHumanBoneName.RightShoulder ).quaternion.w = 1;

    }

    count++;
	}


  
	renderer.render( scene, camera );
}


connectiot();
animate();