import Animated, {
    useAnimatedScrollHandler,
    scrollTo,
    useAnimatedRef,
} from 'react-native-reanimated';
import {View, Text, SafeAreaView} from 'react-native';
import React, { useRef, useState } from 'react';

export default function OnScrollScrollTo(props) {

    const svStyle = {
        height: 70,
        flexGrow: 0,
        //backgroundColor: 'red',
    };

    const itemStyle = { padding: 20 };

    const [state, setState] = useState(0);
    const sv1 = useAnimatedRef();
    const sv2 = useRef();
    const onScrollSv2 = useAnimatedScrollHandler({
        onScroll: (event) => {
            scrollTo(sv1, event.contentOffset.x * 0.5, 0, false);
            //setState(event.contentOffset.x);
        },
    });

    return (
        <>
            <SafeAreaView></SafeAreaView>
            <Text>{state}</Text>
            <View
                style={{
                flex: 1,
                flexDirection: 'column',
                justifyContent: 'flex-start',
            }}>
                <Animated.ScrollView ref={sv1} style={svStyle} horizontal>
                    {[...Array(14).keys()].map(x => <Text key={x} style={itemStyle}>{x}</Text>)}
                </Animated.ScrollView>
                <Animated.ScrollView ref={sv2} style={svStyle} horizontal
                                     onScroll={onScrollSv2} scrollEventThrottle={1}
                                     >
                    {[...Array(20).keys()].map(x => <Text key={x} style={itemStyle}>{x}</Text>)}
                </Animated.ScrollView>
            </View>
            <SafeAreaView></SafeAreaView>
        </>
    );
}
