import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { Button, StyleSheet, Text, View } from 'react-native';
import Shipbook from '@shipbook/react-native';

// Initialize Shipbook - replace with your actual credentials
// TODO: Replace these with your Shipbook App ID and App Key from https://app.shipbook.io
const APP_ID = 'YOUR_APP_ID_HERE';
const APP_KEY = 'YOUR_APP_KEY_HERE';

let log = Shipbook.getLogger("test");


export default function App() {
  useEffect(() => {
    // Your code here
    console.log('entered useEffect')
    Shipbook.start(APP_ID, APP_KEY, {
      appVersion: '1.0.1',
      appBuild: '2',
    });
    Shipbook.registerUser("test");
  }, []);

  // Error.captureStackTrace(stacktrace);
  // let stack = JSON.stringify(stacktrace);
  return (
    <View style={styles.container}>
      <Text>WOW </Text>
      <Text>The stacktrace: </Text>
      <StatusBar style="auto" />
      <Button title="log" onPress={() => {
        log.e('error');
        log.w('warning')
        log.i('info');
        log.d('debug');
        log.v('verbose');
      }} />
      <Button title="exception" onPress={() => {
        try {
          let test;
          const color = test.color;
          console.log(color);
        } catch (err) {
          // handle error here
          console.log('catched the error')
          throw err;
        }
      }} />
      <Button title="screen" onPress={() => {
        Shipbook.screen('screenWow');
      }} />
      <Button title="register user1" onPress={() => {
        console.log("register");
        Shipbook.registerUser('user1', 'amazing')
      }} />
      <Button title="logout" onPress={() => {
        Shipbook.logout();
      }} />
      <Button title="register user2" onPress={() => {
        Shipbook.registerUser('user2', 'nice')
      }} />

    </View>
  );

}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
