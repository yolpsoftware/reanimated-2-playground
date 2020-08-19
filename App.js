import Animated, {
    useAnimatedScrollHandler,
    scrollTo,
    useAnimatedRef,
    useDerivedValue,
    useSharedValue,
} from 'react-native-reanimated';
import {View, Text, SafeAreaView, StyleSheet, TouchableOpacity, FlatList } from 'react-native';
import React, { useRef, useState, useCallback } from 'react';

const LEVEL_HEIGHT = 70;
const NOF_LEVELS = 4;

const AnimatedFlatList = Animated.createAnimatedComponent(FlatList);

export default function CoupledScrollViews(props) {

    const [selectedCourse, setSelectedCourse] = useState(null);
    const levelCourses = [];                       // TODO PERF: this should be memoized
    const levelYOffsets = [];
    const scrollIndices = [];             // tells us at which index the scroll boxes currently are - we use floats for indices, because the user might be between two indices
    const isCurrentlyScrolling = [];     // this is used to decide which values to update from which values when they change
    for (let i = 0; i < NOF_LEVELS; i++) {
        if (i === 0) {
            levelCourses.push(getFirstLevelCourses(rootCourse.children.filter((x) => typeof x !== 'string')));
        } else {
            levelCourses.push(getSubLevelCourses(levelCourses[i - 1]));
        }
        levelYOffsets.push(new Animated.Value(0));
        scrollIndices.push(useSharedValue(0));
        isCurrentlyScrolling.push(useSharedValue(0));
    }
    // copy sub-level list indices to parent levels
    const lowestLevel = levelCourses[NOF_LEVELS - 1];
    lowestLevel.forEach(lowestLevelCourse => {
        for (let level = NOF_LEVELS - 2; level >= 0; level--) {
            for (let j = 0; j < levelCourses[level].length; j++) {
                const course = levelCourses[level][j];
                let isMatch = true;
                for (let k = 0; k < course.index.length; k++) {
                    if (course.index[k] !== lowestLevelCourse.index[k]) {
                        isMatch = false;
                        break;
                    }
                }
                if (isMatch) {
                    for (let k = course.listIndex.length; k < lowestLevelCourse.listIndex.length; k++) {
                        course.listIndex[k] = lowestLevelCourse.listIndex[k];
                        course.nOfSiblings[k] = lowestLevelCourse.nOfSiblings[k];
                    }
                }
            }
        }
    });
    // --- here we do the actual coupling of the ScrollViews (CAR-179). This worklet is run whenever one of the scrollIndices or isCurrentlyScrolling values changes
    useDerivedValue(() => {
        //console.info('updated');
        if (isCurrentlyScrolling[0].value === 1) {
            const index = Math.floor(scrollIndices[0].value);
            const progress = scrollIndices[0].value - index;
            const course = levelCourses[0][index];
            //console.info(`course.listIndex: ${course.listIndex}, siblings: ${course.nOfSiblings}`)
            if (!course) {
                console.info('course undefined');
            } else {
                scrollIndices[1].value = course.listIndex[1] + course.nOfSiblings[1] * progress;
                scrollIndices[2].value = course.listIndex[2] + course.nOfSiblings[2] * progress;
            }
        } else if (isCurrentlyScrolling[1].value === 1) {
            const index = Math.floor(scrollIndices[1].value);
            const progress = scrollIndices[1].value - index;
            const course = levelCourses[1][index];
            //console.info(`course.listIndex: ${course.listIndex}, siblings: ${course.nOfSiblings}`)
            if (!course) {
                console.info('course undefined');
            } else {
                scrollIndices[0].value = course.listIndex[0]; // + course.nOfSiblings[0] * progress;
                scrollIndices[2].value = course.listIndex[2] + course.nOfSiblings[2] * progress;
            }
        } else if (isCurrentlyScrolling[2].value === 1) {
            const index = Math.floor(scrollIndices[2].value);
            const progress = scrollIndices[2].value - index;
            const course = levelCourses[2][index];
            //console.info(`course.listIndex: ${course.listIndex}, siblings: ${course.nOfSiblings}`)
            if (!course) {
                console.info('course undefined');
            } else {
                scrollIndices[0].value = course.listIndex[0];
                scrollIndices[1].value = course.listIndex[1];
            }
        }
        //scrollTo(aref, 0, scroll.value * 100, true);
    });
    const scrollRefs = [useAnimatedRef(null), useAnimatedRef(null), useAnimatedRef(null), useAnimatedRef(null)];
    const onCoursePress = useCallback((course) => {
        setSelectedCourse(course.course);
        const courseLevel = course.index.length;
        for (let level = 0; level < 4; level++) {
            levelYOffsets[level].setValue(level < courseLevel ? 0 : (courseLevel - level) * LEVEL_HEIGHT);
            if (scrollRefs[level].current != null) {
                let item = null;
                if (scrollRefs[level].current.getNode) {
                    item = scrollRefs[level].current.getNode();
                } else {
                    item = scrollRefs[level].current;
                }
                item.scrollToIndex({ animated: true, index: course.listIndex[level], });
            }
        }
    }, []);
    const isSubscribedToCourse = useCallback((course = null) => {
        if (!props.enrollments) {
            return false;
        }
        let result = props.enrollments.filter(x => x.courseId == course.id).length > 0; // && x.active).length > 0;
        return result;
    }, []);
    const isSubscribedToParent = useCallback((course = null) => {
        let parent = CatalogHelper.catalog[course.parentId];
        while (true) {
            if (!parent) {
                return false;
            } else if (isSubscribedToCourse(parent)) {
                return true;
            }
            parent = CatalogHelper.catalog[parent.parentId];
        }
    }, []);
    const onSubscribe = useCallback(() => {
        if (isSubscribedToCourse(selectedCourse)) {
            props.unsubscribeAction(selectedCourse.id);
        } else if (isSubscribedToParent(selectedCourse)) {
            // no-op
        } else {
            props.subscribeAction(selectedCourse.id, 5);
        }
    }, [selectedCourse]);
    const onLearn = useCallback(() => {
        let course = selectedCourse;
        if (!course) {
            debugger;
        }
        props.initSessionAction([course.id], false);
        props.navigation.navigate('Training', {
            course: course,
        });
    }, [selectedCourse]);
    return (<View style={styles.container}>
        <SafeAreaView></SafeAreaView>
        <View style={styles.treeContainer}>
            {[0, 1, 2, 3].map(level => (
                <Animated.View key={level} style={[styles.catalogLevel, { zIndex: -level}]}>{/*, transform: [{ translateY: levelYOffsets[level] }] }]}>*/}
                    <CourseList courses={levelCourses[level]} onCoursePress={onCoursePress} scrollRef={scrollRefs[level]}
                                scrollIndex={scrollIndices[level]} isCurrentlyScrolling={isCurrentlyScrolling[level]}
                                level={level}
                                />
                </Animated.View>
            ))}
        </View>
        {selectedCourse && selectedCourse.canLearn != false &&
            <View style={styles.courseInfo}>
                <>
                    <Text style={{fontSize: 20}}>{selectedCourse.title?.en}</Text>
                </>
            </View>
        }
        <SafeAreaView></SafeAreaView>
    </View>);
}

const getFirstLevelCourses = (courses) => {
    return courses.map((course, index) => ({
        index: [index],
        nOfSiblings: [courses.length],
        course: course,
        listIndex: [index],
        isShadow: false,
        leftOffset: [],
        rightOffset: [],
    }));
}

const getSubLevelCourses = (courses) => {
    const result = courses.map(x => {
        const children = x.course.children?.filter(x => typeof x !== 'string');
        if (!children || children.length === 0) {
            return [{
                index: [...x.index, 0],
                nOfSiblings: [...x.nOfSiblings, 1],
                course: x.course,
                listIndex: [...x.listIndex],
                isShadow: true,
                leftOffset: [],
                rightOffset: [],
            }]
        }
        return children.map((y, index) => ({
            index: [...x.index, index],
            nOfSiblings: [...x.nOfSiblings, children.length],
            course: y,
            listIndex: [...x.listIndex],
            isShadow: false,
            leftOffset: [],
            rightOffset: [],
        }))
    })
        .filter(x => !!x)
        .reduce((a, b) => a.concat(b));
    result.forEach((item, index) => {
        item.listIndex.push(index);
    });
    return result;
}

const CourseList = (props) => {

    const offsets = useSharedValue([]);
    let itemWidths = [];
    let debouncer = null;

    const renderCourseCb = (item) => {
        if (item.item.index == null) {
            debugger;
        }
        const course = item.item.course;
        const onLayout = (event) => {
            const width = event.nativeEvent.layout.width;
            if (itemWidths[item.index] === width) {
                return;
            }
            itemWidths[item.index] = width;
            clearTimeout(debouncer);
            debouncer = setTimeout(() => {
                //const newOffsets = [...offsets.value];
                const newOffsets = [];
                for (let i = 0; i < offsets.value.length; i++) {
                    newOffsets[i] = offsets.value[i];
                }
                //console.info(`offsets: ${newOffsets.join(',')}`)
                const max = Math.max(itemWidths.length + 1, newOffsets.length);
                for (let i = 0; i < max; i++) {
                    if (newOffsets[i] == null) {
                        newOffsets[i] = 0;
                    }
                }
                for (let i = 0; i < max - 1; i++) {
                    newOffsets[i + 1] = newOffsets[i] + (itemWidths[i] || 0);
                }
                //console.info(`settings offsets: ${newOffsets.join(',')}`)
                offsets.value = newOffsets;
            }, 30);
        }
        const courseIndex = item.item;
        return (
            <CourseView key={course.id} course={course} index={courseIndex.index}
                onPress={() => props.onCoursePress(courseIndex)}
                onLayout={onLayout}
                isLast={item.index === props.courses.length - 1}
                isShadow={courseIndex.isShadow}
                />
        );
    }

    const onScrollToIndexFailed = (error) => {
        props.scrollRef.current.scrollToOffset({ offset: error.averageItemLength * error.index, animated: true });
        setTimeout(() => {
            if (props.scrollRef?.current !== null) {
                props.scrollRef.current.scrollToIndex({ index: error.index, animated: true });
            }
        }, 100);
    }

    const scrollIndex = props.scrollIndex;
    const isCurrentlyScrolling = props.isCurrentlyScrolling;
    if (!scrollIndex || !isCurrentlyScrolling) {
        console.info(`scrollIndex or isCurrentlyScrolling null`)
    }
    const scrollHandler = useAnimatedScrollHandler({
        onScroll: (event) => {
            // TODO PERF might be optimized via binary search
            for (let i = 0; i < offsets.value.length; i++) {
                if (offsets.value[i] > event.contentOffset.x) {
                    if (i === 0) {
                        console.info('0')
                        scrollIndex.value = 0;
                    } else {
                        let value = i - 1 + (event.contentOffset.x - offsets.value[i - 1]) / (offsets.value[i] - offsets.value[i - 1]);
                        console.info(value)
                        scrollIndex.value = value;
                    }
                    return;
                }
            }
            scrollIndex.value = offsets.value.length;
        },
        onBeginDrag: () => {
            isCurrentlyScrolling.value = 1;
        },
        onEndDrag: () => {
            isCurrentlyScrolling.value = 0;
        },
    });
    // --- listening to scrollIndex changes outside of the component
    const scrollRef = props.scrollRef;
    const level = props.level;
    useDerivedValue(() => {
        //console.info(`isCurrentlyScrolling.value ${isCurrentlyScrolling.value} ${scrollIndex.value}`);
        if (isCurrentlyScrolling.value === 0 && offsets.value.length > 0) {
            const index = Math.max(Math.min(Math.floor(scrollIndex.value), offsets.value[offsets.value.length - 1]), 0);
            const progress = Math.max(Math.min(scrollIndex.value - index, 1), 0);
            const newScrollOffset = offsets.value[index] + (index < offsets.value.length - 1 ? progress * (offsets.value[index + 1] - offsets.value[index]) : 0);
            //console.info(`level ${level}: ${index}, ${progress}, ${newScrollOffset}`)
            scrollTo(scrollRef, newScrollOffset, 0, false);
        }
    })
    return (
        <AnimatedFlatList ref={props.scrollRef} data={props.courses}
            style={[styles.flatlist]}
            showsHorizontalScrollIndicator={false}
            renderItem={renderCourseCb}
            horizontal={true}
            onScroll={scrollHandler} scrollEventThrottle={60}
            snapToOffsets={offsets.value}
            snapToAlignment={'start'}
            keyExtractor={item => item.course.id}
            initialNumToRender={10}
            onScrollToIndexFailed={onScrollToIndexFailed}
            />
    );
}

const DEBUG_COLORS = ['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'brown', 'turquoise'];
const CourseView = ({ course, onPress, index, onLayout, isLast, isShadow }) => {
    const screenWidth = 375;            // TODO: LayoutHelper
    return (
        <View key={course.id} onLayout={onLayout} style={[styles.courseWrapper, isShadow ? styles.shadowCourse : null, isLast ? { minWidth: screenWidth } : null]}>
            <TouchableOpacity style={[styles.course, isShadow ? styles.shadowCourseContent : null]} onPress={onPress}>
                <View style={styles.icon}>
                    {index.map((x, i) => <View key={i} style={{backgroundColor: DEBUG_COLORS[x], flexGrow: 1}} />)}
                </View>
                <View style={styles.courseTitleContainer}>
                    <Text style={styles.courseTitle}>{course.title && course.title.en}</Text>
                    <Text style={styles.courseSubtitle}>{course.subtitle && course.subtitle.en}</Text>
                </View>
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        paddingTop: 80,
    },
    treeContainer: {
        borderBottomWidth: .333,
        borderColor: '#AAA',
    },
    catalogLevel: {
        height: LEVEL_HEIGHT,
        //backgroundColor: 'red',
    },
    courseWrapper: {
        borderTopWidth: .33,            // TODO: adapt to pixel density
        borderRightWidth: .33,
        borderColor: '#AAA',
    },
    course: {
        padding: 10,
        flexDirection: 'row',
    },
    shadowCourse: {
        borderTopWidth: 0,
    },
    shadowCourseContent: {
        opacity: 0,
    },
    icon: {
        width: 50,
        height: 50,
        marginRight: 10,
        borderRadius: 10,
        alignItems: 'stretch',
        overflow: 'hidden',
    },
    courseTitleContainer: {
        paddingVertical: 4,
        maxWidth: 250,
    },
    courseTitle: {
        fontSize: 17,
    },
    courseSubtitle: {
        fontSize: 14,
        color: '#555',
        fontWeight: '300',
    },
    flatlist: {
        flex: 1,
        //borderColor: 'red',
        //borderWidth: .33,
    },
    courseInfo: {
        padding: 16,
    },
    buttonBar: {
        flexBasis: 'auto',
        flexGrow: 0,
        paddingVertical: 16,
        flexDirection: 'row',
    },
    buttonBarButton: {
        height: 40,
        minWidth: 40,
        backgroundColor: 'blue',
        borderRadius: 20,
        paddingHorizontal: 10,
        paddingVertical: 9,
        marginRight: 10,
    },
    buttonBarText: {
        paddingTop: 3,
        color: 'white',
    },
});

const rootCourse =
    {
     "id": "root",
     "title": {
      "en": "root"
     },
     "canLearn": false,
     "children": [
      "MOST_VIEWED",
      {
       "id": "ph",
       "title": {
        "de": "Philosophien?",
        "en": "Humanities"
       },
       "children": [
        {
         "id": "ph-philosophy",
         "title": {
          "de": "Philosophie",
          "en": "Philosophy"
         },
         "children": [
          {
           "id": "ph-philosophy-philosophers",
           "title": {
            "de": "Philosophen",
            "en": "Philosophers"
           }
          },
          {
           "id": "ph-philosophy-branches",
           "title": {
            "de": "Gebiete der Philosophie",
            "en": "Branches of Philosophy"
           }
          },
          {
           "id": "ph-philosophy-concepts",
           "title": {
            "de": "Philosophische Begriffe",
            "en": "Philosophical Concepts"
           }
          }
         ]
        },
        {
         "id": "ph-linguistics",
         "title": {
          "de": "Linguistik",
          "en": "Linguistics"
         },
         "children": [
          {
           "id": "ph-linguistics-linguists",
           "title": {
            "de": "Linguistiker",
            "en": "Linguists"
           }
          },
          {
           "id": "ph-linguistics-branches",
           "title": {
            "de": "Gebiete der Linguistik",
            "en": "Branches of Linguistics"
           }
          },
          {
           "id": "ph-linguistics-concepts",
           "title": {
            "de": "Linguistische Begriffe",
            "en": "Linguistical Concepts"
           }
          }
         ]
        },
        {
         "id": "ph-religion",
         "title": {
          "de": "Religion",
          "en": "Religion"
         }
        },
        {
         "id": "ph-history",
         "title": {
          "de": "Geschichte & Politik",
          "en": "History & Politics"
         },
         "children": [
          {
           "id": "ph-history-historians",
           "title": {
            "de": "Historiker",
            "en": "Historians"
           }
          },
          {
           "id": "ph-history-wars",
           "title": {
            "de": "Kriege der Welt",
            "en": "Wars of the World"
           }
          },
          {
           "id": "ph-history-region",
           "title": {
            "de": "Geschichte nach Ländern",
            "en": "History by Country"
           },
           "canLearn": false,
           "children": [
            {
             "id": "ph-history-region-de",
             "title": {
              "de": "Geschichte Deutschlands",
              "en": "German History"
             },
             "children": [
              {
               "id": "ph-history-region-de-wars",
               "title": {
                "de": "Kriege Deutschlands",
                "en": "Wars of Germany"
               },
               "defs": [
                "ph-history-region-de && ph-history-wars"
               ]
              }
             ]
            },
            "ph-history-region-us"
           ],
           "image": "https://images.unsplash.com/photo-1554623515-3b2f224b92f2?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=crop&w=600&q=80"
          },
          "ph-history-elections",
          "ph-history-referendums",
          {
           "id": "ph-history-politicians",
           "title": {
            "de": "Politiker*innen",
            "en": "Politicians"
           },
           "children": [
            {
             "id": "ph-history-politicians-headsofgov",
             "title": {
              "de": "Regierungschefs",
              "en": "Heads of Government"
             },
             "crossRelations": [
              "country",
              "continent"
             ],
             "image": "https://images.unsplash.com/photo-1548337357-2910deeae339?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=crop&w=600&q=80"
            },
            {
             "id": "ph-history-politicians-headsofstate",
             "title": {
              "de": "Staatsoberhäupter",
              "en": "Heads of State"
             },
             "children": [
              {
               "id": "ph-history-politicians-headsofstate-country#us",
               "title": {
                "de": "US-Präsidenten",
                "en": "Presidents of the United States"
               },
               "image": "https://images.unsplash.com/photo-1557760401-40a9ec55f25c?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=crop&w=600&q=80"
              }
             ],
             "crossRelations": [
              "country",
              "continent"
             ],
             "image": "https://images.unsplash.com/photo-1548337357-2910deeae339?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=crop&w=600&q=80"
            }
           ],
           "crossRelations": [
            "country",
            "continent"
           ],
           "image": "https://images.unsplash.com/photo-1548337357-2910deeae339?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=crop&w=600&q=80"
          }
         ],
         "defs": "CHILDREN",
         "image": "https://images.unsplash.com/photo-1461360370896-922624d12aa1?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=crop&w=600&q=80"
        }
       ],
       "image": "https://images.unsplash.com/photo-1502700807168-484a3e7889d0?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=crop&w=600&q=80"
      },
      {
       "id": "art",
       "title": {
        "de": "Kunst & Film",
        "en": "Arts"
       },
       "children": [
        {
         "id": "art-literature",
         "title": {
          "de": "Literatur",
          "en": "Literature"
         },
         "children": [
          {
           "id": "art-literature-authors",
           "title": {
            "de": "Autoren*",
            "en": "Authors"
           }
          },
          {
           "id": "art-literature-fiction",
           "title": {
            "de": "Fiktion",
            "en": "Fiction"
           },
           "children": [
            {
             "id": "art-literature-fiction-authors",
             "title": {
              "de": "Autoren*",
              "en": "Authors"
             }
            }
           ]
          }
         ]
        },
        {
         "id": "art-film",
         "title": {
          "de": "Film",
          "en": "Film"
         },
         "children": [
          {
           "id": "art-film-directors",
           "title": {
            "de": "Regisseure",
            "en": "Directors"
           }
          },
          {
           "id": "art-film-actors",
           "title": {
            "de": "Schauspieler*",
            "en": "Actors & Actresses"
           }
          },
          {
           "id": "art-film-producers",
           "title": {
            "de": "Produzent*innen",
            "en": "Producers"
           }
          }
         ]
        },
        {
         "id": "art-music",
         "title": {
          "de": "Musik",
          "en": "Music"
         },
         "children": [
          {
           "id": "art-music-musicians",
           "title": {
            "de": "Musiker*",
            "en": "Musicians"
           }
          },
          {
           "id": "art-music-singers",
           "title": {
            "de": "Sänger*innen",
            "en": "Singers"
           }
          },
          {
           "id": "art-music-composers",
           "title": {
            "de": "Komponist*innen",
            "en": "Composers"
           }
          },
          {
           "id": "art-music-Conductors",
           "title": {
            "de": "Dirigenten*",
            "en": "Conductors"
           }
          }
         ]
        },
        {
         "id": "art-painting",
         "title": {
          "de": "Malerei",
          "en": "Painting"
         },
         "children": [
          {
           "id": "art-painting-painters",
           "title": {
            "de": "Maler*",
            "en": "Painters"
           }
          },
          {
           "id": "art-painting-paintings",
           "title": {
            "de": "Gemälde",
            "en": "Paintings"
           }
          }
         ]
        },
        {
         "id": "art-photography",
         "title": {
          "de": "Fotografie",
          "en": "Photography"
         },
         "children": [
          {
           "id": "art-photography-photographers",
           "title": {
            "de": "Fotograf*innen",
            "en": "Photographers"
           }
          },
          {
           "id": "art-photography-photographs",
           "title": {
            "de": "Fotos",
            "en": "Photos"
           }
          }
         ]
        },
        {
         "id": "art-musical",
         "title": {
          "de": "Mucicals",
          "en": "Musicals"
         },
         "children": [
          {
           "id": "art-musicals-actors",
           "title": {
            "de": "Schauspieler*",
            "en": "Actors & Actresses"
           }
          }
         ]
        }
       ],
       "image": "https://images.unsplash.com/photo-1520856990214-7a9e59dd5ff7?ixlib=rb-1.2.1&auto=format&fit=crop&w=600&q=80"
      }]
    };
