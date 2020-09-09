import Animated, {
    useAnimatedScrollHandler,
    scrollTo,
    useAnimatedRef,
    useDerivedValue,
    useSharedValue,
    withSpring,
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
    const isCurrentlyScrolling = [];      // this is used to decide which values to update from which values when they change. 2 = this level is currently actively being scrolled by the user. 1 = this level has been scrolled by the user, it remains active until another level gets value 2. 0 = this level is not currently being scrolled.
    for (let i = 0; i < NOF_LEVELS; i++) {
        if (i === 0) {
            levelCourses.push(getFirstLevelCourses(rootCourse.children.filter((x) => typeof x !== 'string')));
        } else {
            levelCourses.push(getSubLevelCourses(levelCourses[i - 1]));
        }
        levelYOffsets.push(new Animated.Value(0));
        scrollIndices.push(useSharedValue());
        isCurrentlyScrolling.push(useSharedValue());
        if (scrollIndices[i].value == null) {
            scrollIndices[i].value = 0;
            isCurrentlyScrolling[i].value = 0;
        }
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
        const maxIsCurrentlyScrolling = Math.max(Math.max(isCurrentlyScrolling[0].value, isCurrentlyScrolling[1].value), isCurrentlyScrolling[2].value);
        for (let level = 0; level < 3; level++) {
            if (maxIsCurrentlyScrolling === 2 && isCurrentlyScrolling[level].value === 1) {
                isCurrentlyScrolling[level].value = 0;
                console.info(`setting level ${level} scrolling to ${0}`);
            } else if (isCurrentlyScrolling[level].value > 0) {
                const index = Math.floor(scrollIndices[level].value);
                const progress = scrollIndices[level].value - index;
                const course = levelCourses[level][index];
                //console.info(`course.listIndex: ${course.listIndex}, siblings: ${course.nOfSiblings}`)
                if (!course) {
                    console.info(`course undefined, level ${level}, index ${index}`);
                } else {
                    for (let otherLevel = 0; otherLevel < 3; otherLevel++) {
                        if (otherLevel < level) {
                            //if (otherLevel === 0) { console.log(`level ${level} setting (4) to ${course.listIndex[otherLevel]}`)}
                            scrollIndices[otherLevel].value = withSpring(course.listIndex[otherLevel], {
                                damping: 30,
                                mass: 1,
                                stiffness: 200 + level * 10,
                            });
                        } else if (otherLevel > level) {
                            const newValue = course.listIndex[otherLevel] + course.nOfSiblings[otherLevel] * progress;
                            scrollIndices[otherLevel].value = withSpring(newValue, {
                                damping: 30,
                                mass: 1,
                                stiffness: 200 + level * 10,
                            });
                        }
                    }
                }
            }
        }
    });
    const scrollRefs = [useAnimatedRef(null), useAnimatedRef(null), useAnimatedRef(null), useAnimatedRef(null)];
    const onCoursePress = useCallback((course) => {
        setSelectedCourse(course.course);
        const courseLevel = course.index.length;
        for (let level = 0; level < 4; level++) {
            levelYOffsets[level].setValue(level < courseLevel ? 0 : (courseLevel - level) * LEVEL_HEIGHT);
            if (scrollRefs[level].current != null) {
                scrollRefs[level].current.scrollToIndex({ animated: true, index: course.listIndex[level], });
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

//let itemWArr = null;
const CourseList = (props) => {

    const offsets = useSharedValue(null);
    if (!offsets.value) {
        offsets.value = [];
    }
    const [offsetsRerenderCounter, doRerender] = useState(0);
    let [itemWidths, setItemWidths] = useState([]);
    //if (props.level === 2 && itemWArr !== itemWidths) {
    //    console.info(`creating new itemWidths array for level ${props.level}: ${itemWidths.join(', ')}`);
    //    itemWArr = itemWidths;
    //}

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
            // we previously had a debouncer here, to avoid excessive re-renders, but that didn't work great
            const newItemWidths = [...itemWidths];
            newItemWidths[item.index] = width;
            setItemWidths(newItemWidths);
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
            //if (level === 2) {
                //console.info(`${level} itemWidths: ${itemWidths.join(',')}`);
                //console.info(`${level} setting offsets: ${newOffsets.join(',')}`);
            //}
            offsets.value = newOffsets;
            doRerender(offsetsRerenderCounter + 1);
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
    const level = props.level;
    const scrollHandler = useAnimatedScrollHandler({
        onScroll: (event) => {
            if (isCurrentlyScrolling.value === 0) {
                return;
            }
            const log = str => {} //{ console.log(str) };
            // TODO PERF might be optimized via binary search
            for (let i = 0; i < offsets.value.length; i++) {
                if (offsets.value[i] >= event.contentOffset.x) {
                    if (i === 0) {
                        scrollIndex.value = 0;
                        log(`level ${level} setting (1) to 0`)
                    } else {
                        let value = i - 1 + (event.contentOffset.x - offsets.value[i - 1]) / (offsets.value[i] - offsets.value[i - 1]);
                        scrollIndex.value = value;
                        log(`level ${level} setting (2) to ${value} (${offsets.value[i]}, ${event.contentOffset.x})`)
                    }
                    return;
                }
            }
            scrollIndex.value = offsets.value.length;
            log(`level ${level} setting (3) to ${offsets.value.length}`);
        },
        onBeginDrag: () => {
            isCurrentlyScrolling.value = 2;
            //console.info(`setting ${level} scrolling to ${2}`);
        },
        onEndDrag: () => {
            isCurrentlyScrolling.value = 1;
            //console.info(`setting ${level} scrolling to ${1}`);
        },
    });
    // --- listening to scrollIndex changes outside of the component
    const scrollRef = props.scrollRef;
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
     },
     {
      "id": "lang",
      "title": {
       "de": "Sprachen",
       "en": "Languages"
      },
      "canLearn": false,
      "children": [
       "lang-en",
       "lang-es",
       "lang-fr",
       {
        "id": "lang-zh",
        "title": {
         "de": "Chinesisch",
         "en": "Chinese"
        },
        "children": [
         "lang-zh-alphabet",
         "lang-zh-numbers",
         {
          "id": "lang-zh-words",
          "title": {
           "de": "Chinesisches Vokabular",
           "en": "Chinese Vocabulary"
          }
         },
         {
          "id": "lang-zh-sentences",
          "title": {
           "de": "Chinesische Sätze",
           "en": "Chinese Sentences"
          }
         }
        ],
        "image": null
       },
       {
        "id": "lang-it",
        "title": {
         "de": "Italienisch",
         "en": "Italian"
        },
        "children": [
         "lang-it-alphabet",
         "lang-it-numbers",
         {
          "id": "lang-it-words",
          "title": {
           "de": "Italienisches Vokabular",
           "en": "Italian Vocabulary"
          },
          "image": "https://images.unsplash.com/photo-1451226428352-cf66bf8a0317?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=crop&w=600&q=80"
         },
         {
          "id": "lang-it-sentences",
          "title": {
           "de": "Italienische Sätze",
           "en": "Italian Sentences"
          },
          "image": "https://images.unsplash.com/photo-1475154404624-07909433bbfb?ixlib=rb-1.2.1&auto=format&fit=crop&w=600&q=80"
         }
        ],
        "defs": "CHILDREN",
        "image": "https://images.unsplash.com/photo-1498579150354-977475b7ea0b?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=crop&w=600&q=80"
       },
       {
        "id": "lang-sign",
        "title": {
         "de": "Gebärdensprachen",
         "en": "Sign Languages"
        },
        "canLearn": false,
        "children": [
         {
          "id": "lang-sign-de",
          "title": {
           "de": "Deutsche Gebärdensprachen",
           "en": "German Sign Languages"
          },
          "canLearn": false,
          "children": [
           {
            "id": "lang-sign-de-ch",
            "title": {
             "de": "Deutschschweizer Gebärdensprache",
             "en": "Swiss-German Sign Language"
            },
            "children": [
             {
              "id": "lang-sign-de-ch-words",
              "title": {
               "de": "Deutschschweizer Gebärdensprache - Wörter",
               "en": "Swiss-German Sign Language - Words"
              },
              "image": "https://images.unsplash.com/photo-1514970746-d4a465d514d0?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=crop&w=600&q=80"
             },
             {
              "id": "lang-sign-de-ch-sentences",
              "title": {
               "de": "Deutschschweizer Gebärdensprache - Sätze",
               "en": "Swiss-German Sign Language - Sentence"
              },
              "image": "https://images.unsplash.com/photo-1514970746-d4a465d514d0?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=crop&w=600&q=80"
             }
            ],
            "defs": "CHILDREN",
            "image": "https://images.unsplash.com/photo-1514970746-d4a465d514d0?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=crop&w=600&q=80"
           }
          ],
          "image": "https://images.unsplash.com/photo-1534313314376-a72289b6181e?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=crop&w=600&q=80"
         }
        ],
        "image": "https://images.unsplash.com/photo-1524964056700-f5738231ad5e?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=crop&w=600&q=80"
       },
       "lang-de",
       "lang-pt",
       "lang-jp"
      ],
      "image": "https://images.unsplash.com/photo-1535483102974-fa1e64d0ca86?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=crop&w=600&q=80"
     },
     {
      "id": "sc",
      "title": {
       "de": "Naturwissenschaften",
       "en": "Natural Sciences"
      },
      "canLearn": false,
      "children": [
       {
        "id": "sc-physics",
        "title": {
         "de": "Physik",
         "en": "Physics"
        },
        "children": [
         {
          "id": "sc-physics-physicists",
          "title": {
           "de": "Physiker*innen",
           "en": "Physicists"
          }
         },
         {
          "id": "sc-physics-theories",
          "title": {
           "de": "Theorien",
           "en": "Theories"
          }
         },
         {
          "id": "sc-physics-laws",
          "title": {
           "de": "Gesetze",
           "en": "Laws"
          }
         },
         {
          "id": "sc-physics-units",
          "title": {
           "de": "Einheiten",
           "en": "Units"
          }
         },
         {
          "id": "sc-physics-branches",
          "title": {
           "de": "Gebiete der Physik",
           "en": "Branches of Physics"
          }
         },
         {
          "id": "sc-physics-concepts",
          "title": {
           "de": "Physikalische Begriffe",
           "en": "Concepts of Physics"
          }
         }
        ],
        "def": "CHILDREN"
       },
       {
        "id": "sc-chem",
        "title": {
         "de": "Chemie",
         "en": "Chemistry"
        },
        "children": [
         {
          "id": "sc-chem-chemists",
          "title": {
           "de": "Chemiker*",
           "en": "Chemists"
          }
         },
         {
          "id": "sc-chem-functionalgroups",
          "title": {
           "de": "Funktionale Gruppen",
           "en": "Functional Groups"
          }
         },
         {
          "id": "sc-chem-substances",
          "title": {
           "de": "Substanzen",
           "en": "Substances"
          },
          "children": [
           {
            "id": "sc-chem-substances-ester",
            "title": {
             "de": "Ester",
             "en": "Ester"
            }
           },
           {
            "id": "sc-chem-substances-polyamids",
            "title": {
             "de": "Polyamine",
             "en": "Polyamids"
            }
           }
          ]
         },
         {
          "id": "sc-chem-classes",
          "title": {
           "de": "Strukturklassen",
           "en": "Structural Classes"
          }
         },
         {
          "id": "sc-chem-reactions",
          "title": {
           "de": "Reaktionen",
           "en": "Reactions"
          }
         },
         {
          "id": "sc-chem-branches",
          "title": {
           "de": "Gebiete der Chemie",
           "en": "Branches of Chemistry"
          }
         },
         {
          "id": "sc-chem-concepts",
          "title": {
           "de": "Begriffe der Chemie",
           "en": "Concepts of Chemistry"
          }
         }
        ],
        "def": "CHILDREN"
       },
       {
        "id": "sc-biology",
        "title": {
         "de": "Biologie",
         "en": "Biology"
        },
        "children": [
         {
          "id": "sc-biology-biologists",
          "title": {
           "de": "Biolog*en",
           "en": "Biologists"
          }
         },
         {
          "id": "sc-biology-substances",
          "title": {
           "de": "Substanzen",
           "en": "Substances"
          },
          "children": [
           {
            "id": "sc-biology-substances-proteins",
            "title": {
             "de": "Proteine",
             "en": "Proteins"
            }
           },
           {
            "id": "sc-biology-substances-neurotransmitters",
            "title": {
             "de": "Neurotransmitter",
             "en": "Neurotransmitters"
            }
           },
           {
            "id": "sc-biology-substances-enzymes",
            "title": {
             "de": "Enzyme",
             "en": "Enzymes"
            }
           },
           {
            "id": "sc-biology-substances-hormones",
            "title": {
             "de": "Hormone",
             "en": "Hormones"
            }
           }
          ]
         },
         {
          "id": "sc-biology-taxons",
          "title": {
           "de": "Taxonomie",
           "en": "Taxonomy"
          },
          "children": [
           {
            "id": "sc-biology-taxons-species",
            "title": {
             "de": "Spezies",
             "en": "Species"
            }
           },
           {
            "id": "sc-biology-taxons-genera",
            "title": {
             "de": "Gattungen",
             "en": "Genera"
            }
           },
           {
            "id": "sc-biology-taxons-families",
            "title": {
             "de": "Familien",
             "en": "Families"
            }
           },
           {
            "id": "sc-biology-taxons-orders",
            "title": {
             "de": "Ordnungen",
             "en": "Orders"
            }
           },
           {
            "id": "sc-biology-taxons-classes",
            "title": {
             "de": "Klassen",
             "en": "Classes"
            }
           },
           {
            "id": "sc-biology-taxons-phyla",
            "title": {
             "de": "Stämme",
             "en": "Phyla"
            }
           },
           {
            "id": "sc-biology-taxons-kingdoms",
            "title": {
             "de": "Reiche",
             "en": "Kingdoms"
            }
           }
          ]
         },
         {
          "id": "sc-biology-animals",
          "title": {
           "de": "Tiere",
           "en": "Animals"
          },
          "children": [
           {
            "id": "sc-biology-mammals",
            "title": {
             "de": "Säugetiere",
             "en": "Mammals"
            },
            "children": [
             {
              "id": "sc-biology-mammals-ursidae",
              "title": {
               "de": "Bären",
               "en": "Bears"
              },
              "defs": [
               "sc-biology-mammals-ursidae && sc-biology-taxons-species"
              ]
             },
             {
              "id": "sc-biology-mammals-felidae",
              "title": {
               "de": "Katzen",
               "en": "Cats"
              },
              "defs": [
               "sc-biology-mammals-felidae && sc-biology-taxons-species"
              ]
             },
             {
              "id": "sc-biology-mammals-carnivora",
              "title": {
               "de": "Raubtiere",
               "en": "Carnivora"
              },
              "defs": [
               "sc-biology-mammals-carnivora && sc-biology-taxons-species"
              ]
             },
             {
              "id": "sc-biology-mammals-canidae",
              "title": {
               "de": "Hunde",
               "en": "Canidae"
              },
              "defs": [
               "sc-biology-mammals-canidae && sc-biology-taxons-species"
              ]
             }
            ],
            "defs": [
             "sc-biology-mammals && sc-biology-taxons-species"
            ]
           },
           {
            "id": "sc-biology-cetacea",
            "title": {
             "de": "Wale & Delfine",
             "en": "Whales & Dolphins"
            },
            "defs": [
             "sc-biology-cetacea && sc-biology-taxons-species"
            ]
           },
           {
            "id": "sc-biology-spiders",
            "title": {
             "de": "Spinnen",
             "en": "Spiders"
            },
            "defs": [
             "sc-biology-spiders && sc-biology-taxons-species"
            ]
           },
           {
            "id": "sc-biology-insects",
            "title": {
             "de": "Insekten",
             "en": "Insects"
            },
            "defs": [
             "sc-biology-insects && sc-biology-taxons-species"
            ]
           },
           {
            "id": "sc-biology-birds",
            "title": {
             "de": "Vögel",
             "en": "Birds"
            },
            "children": [
             {
              "id": "sc-biology-birds-accipitriformes",
              "title": {
               "de": "Falken & Adler",
               "en": "Hawks & Eagles"
              },
              "defs": [
               "sc-biology-birds-accipitriformes && sc-biology-taxons-species"
              ]
             }
            ],
            "defs": [
             "sc-biology-birds && sc-biology-taxons-species"
            ]
           },
           {
            "id": "sc-biology-dinosaurs",
            "title": {
             "de": "Dinosaurier",
             "en": "Dinosaurs"
            },
            "defs": [
             "sc-biology-dinosaurs && sc-biology-taxons-species"
            ]
           },
           {
            "id": "sc-biology-sharks",
            "title": {
             "de": "Haifische",
             "en": "Sharks"
            },
            "defs": [
             "sc-biology-sharks && sc-biology-taxons-species"
            ]
           },
           {
            "id": "sc-biology-fish",
            "title": {
             "de": "Fische",
             "en": "Fishes"
            },
            "children": [
             {
              "id": "sc-biology-fish-teleostei",
              "title": {
               "de": null,
               "en": null
              },
              "defs": [
               "sc-biology-fish-teleostei && sc-biology-taxons-species"
              ]
             },
             {
              "id": "sc-biology-fish-chondrichthyes",
              "title": {
               "de": null,
               "en": null
              },
              "defs": [
               "sc-biology-fish-chondrichthyes && sc-biology-taxons-species"
              ]
             }
            ],
            "defs": [
             "sc-biology-fish && sc-biology-taxons-species"
            ]
           }
          ]
         },
         {
          "id": "sc-biology-plants",
          "title": {
           "de": "Pflanzen",
           "en": "Plants"
          },
          "children": [
           {
            "id": "sc-biology-plants-angiosperms",
            "title": {
             "de": "Bedecktsamer",
             "en": "Angiosperms"
            },
            "defs": [
             "sc-biology-plants-angiosperms && sc-biology-taxons-species"
            ]
           },
           {
            "id": "sc-biology-plants-conifers",
            "title": {
             "de": "Koniferen",
             "en": "Coniferae"
            },
            "defs": [
             "sc-biology-plants-conifers && sc-biology-taxons-species"
            ]
           }
          ],
          "defs": [
           "sc-biology-plants && sc-biology-taxons-species"
          ]
         },
         {
          "id": "sc-biology-funghi",
          "title": {
           "de": "Pilze",
           "en": "Funghi"
          },
          "children": [
           {
            "id": "sc-biology-funghi-edible",
            "title": {
             "de": "Esspilze",
             "en": "Edible Mushrooms"
            },
            "defs": [
             "sc-biology-funghi-edible && sc-biology-taxons-species"
            ]
           },
           {
            "id": "sc-biology-funghi-poisonous",
            "title": {
             "de": "Giftpilze",
             "en": "Poisonous Mushrooms"
            },
            "defs": [
             "sc-biology-funghi-poisonous && sc-biology-taxons-species"
            ]
           }
          ],
          "defs": [
           "sc-biology-funghi && sc-biology-taxons-species"
          ]
         },
         {
          "id": "sc-biology-anatomy",
          "title": {
           "de": "Anatomie",
           "en": "Anatomy"
          },
          "children": [
           {
            "id": "sc-biology-anatomy-bones",
            "title": {
             "de": "Knochen",
             "en": "Bones"
            }
           },
           {
            "id": "sc-biology-anatomy-brain_regions",
            "title": {
             "de": "Gehirnregionen",
             "en": "Brain Regions"
            }
           },
           {
            "id": "sc-biology-anatomy-muscles",
            "title": {
             "de": "Muskeln",
             "en": "Muscles"
            }
           },
           {
            "id": "sc-biology-anatomy-organs",
            "title": {
             "de": "Organe",
             "en": "Organs"
            }
           },
           {
            "id": "sc-biology-anatomy-tissues",
            "title": {
             "de": "Gewebe",
             "en": "Tissues"
            }
           },
           {
            "id": "sc-biology-anatomy-blood_vessels",
            "title": {
             "de": "Blutgefässe",
             "en": "Blood Vessels"
            },
            "children": [
             {
              "id": "sc-biology-anatomy-blood_vessels-veins",
              "title": {
               "de": "Venen",
               "en": "Veins"
              },
              "children": null
             },
             {
              "id": "sc-biology-anatomy-blood_vessels-arteries",
              "title": {
               "de": "Arterien",
               "en": "Arteries"
              },
              "children": null
             }
            ]
           },
           {
            "id": "sc-biology-anatomy-joints",
            "title": {
             "de": "Gelenke",
             "en": "Joints"
            },
            "children": null
           }
          ]
         },
         {
          "id": "sc-biology-genes",
          "title": {
           "de": "Gene",
           "en": "Genes"
          }
         },
         {
          "id": "sc-biology-branches",
          "title": {
           "de": "Gebiete der Biologie",
           "en": "Branches of Biology"
          }
         },
         {
          "id": "sc-biology-concepts",
          "title": {
           "de": "Begriffe der Biologie",
           "en": "Concepts of Biology"
          }
         }
        ],
        "def": "CHILDREN"
       },
       {
        "id": "sc-geology",
        "title": {
         "de": "Geologie",
         "en": "Geology"
        },
        "children": [
         {
          "id": "sc-geology-geologists",
          "title": {
           "de": "Geolog*en",
           "en": "Geologists"
          }
         },
         {
          "id": "sc-geology-ages",
          "title": {
           "de": "Zeitalter",
           "en": "Ages"
          },
          "children": [
           {
            "id": "sc-geology-ages-supereons",
            "title": {
             "de": "Super-Äonen",
             "en": "Supereons"
            }
           },
           {
            "id": "sc-geology-ages-eons",
            "title": {
             "de": "Äonen",
             "en": "Eons"
            }
           },
           {
            "id": "sc-geology-ages-eras",
            "title": {
             "de": null,
             "en": "Eras"
            }
           },
           {
            "id": "sc-geology-ages-periods",
            "title": {
             "de": null,
             "en": "Periods"
            }
           },
           {
            "id": "sc-geology-ages-epochs",
            "title": {
             "de": null,
             "en": "Epochs"
            }
           },
           {
            "id": "sc-geology-ages-ages",
            "title": {
             "de": null,
             "en": "Ages"
            }
           }
          ]
         },
         {
          "id": "sc-geology-branches",
          "title": {
           "de": "Gebiete der Geologie",
           "en": "Branches of Geology"
          }
         },
         {
          "id": "sc-geology-concepts",
          "title": {
           "de": "Geologische Begriffe",
           "en": "Geological Concepts"
          }
         }
        ]
       },
       {
        "id": "sc-astronomy",
        "title": {
         "de": "Astronomie",
         "en": "Astronomy"
        },
        "children": [
         {
          "id": "sc-astronomy-astronomists",
          "title": {
           "de": "Astronomen",
           "en": "Astronomists"
          }
         },
         {
          "id": "sc-astronomy-branches",
          "title": {
           "de": "Gebiete der Astronomie",
           "en": "Branches of Astronomy"
          }
         },
         {
          "id": "sc-astronomy-concepts",
          "title": {
           "de": "Begriffe der Astronomie",
           "en": "Concepts of Astronomy"
          }
         }
        ]
       },
       {
        "id": "sc-geography",
        "title": {
         "de": "Geographie",
         "en": "Geography"
        },
        "children": [
         {
          "id": "sc-geography-countries",
          "title": {
           "de": "Länder",
           "en": "Countries"
          },
          "children": [
           {
            "id": "sc-geography-countries-continent#africa",
            "title": {
             "de": "Afrikanische Länder",
             "en": "African Countries"
            },
            "image": "https://images.unsplash.com/photo-1541710779314-420c0acd3fdc?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=crop&w=600&q=80"
           },
           {
            "id": "sc-geography-countries-continent#europe",
            "title": {
             "de": "Europäische Länder",
             "en": "European Countries"
            },
            "image": "https://images.unsplash.com/photo-1467269204594-9661b134dd2b?ixlib=rb-1.2.1&auto=format&fit=crop&w=600&q=80"
           },
           {
            "id": "sc-geography-countries-continent#asia",
            "title": {
             "de": "Asiatische Länder",
             "en": "Asian Countries"
            }
           },
           {
            "id": "sc-geography-countries-continent#north_america",
            "title": {
             "de": "Nordamerikanische Länder",
             "en": "North American Countries"
            }
           },
           {
            "id": "sc-geography-countries-continent#south_america",
            "title": {
             "de": "Südamerikanische Länder",
             "en": "South American Countries"
            }
           },
           {
            "id": "sc-geography-countries-continent#australia",
            "title": {
             "de": "Ozeanische Länder",
             "en": "Oceanic Countries"
            }
           }
          ],
          "crossRelations": [
           "continent"
          ],
          "image": "https://images.unsplash.com/photo-1554623515-3b2f224b92f2?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=crop&w=600&q=80"
         },
         {
          "id": "sc-geography-cities",
          "title": {
           "de": "Städte",
           "en": "Cities"
          },
          "crossRelations": [
           "country",
           "continent"
          ]
         },
         {
          "id": "sc-geography-rivers",
          "title": {
           "de": "Flüsse & Ströme",
           "en": "Rivers"
          },
          "crossRelations": [
           "country",
           "continent"
          ]
         },
         {
          "id": "sc-geography-mountains",
          "title": {
           "de": "Berge & Gipfel",
           "en": "Mountains & Summits"
          },
          "crossRelations": [
           "country",
           "continent"
          ]
         },
         {
          "id": "sc-geography-islands",
          "title": {
           "de": "Inseln",
           "en": "Islands"
          },
          "crossRelations": [
           "country",
           "continent"
          ]
         },
         {
          "id": "sc-geography-lakes",
          "title": {
           "de": "Seen",
           "en": "Lakes"
          },
          "crossRelations": [
           "country",
           "continent"
          ]
         },
         {
          "id": "sc-geography-valleys",
          "title": {
           "de": "Täler",
           "en": "Valleys"
          },
          "crossRelations": [
           "country",
           "continent"
          ]
         },
         {
          "id": "sc-geography-mountainpasses",
          "title": {
           "de": "Bergpässe",
           "en": "Mountain Passes"
          },
          "crossRelations": [
           "country",
           "continent"
          ]
         }
        ],
        "crossRelations": [
         "country",
         "continent"
        ]
       }
      ],
      "image": "https://images.unsplash.com/photo-1526666923127-b2970f64b422?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=crop&w=600&q=80"
     },
     {
      "id": "soc",
      "title": {
       "de": "Soziales & Kultur",
       "en": "Social Sciences & Culture"
      },
      "canLearn": false,
      "children": [
       {
        "id": "soc-psychology",
        "title": {
         "de": "Psychologie",
         "en": "Psychology"
        },
        "children": [
         {
          "id": "soc-psychology-psychologists",
          "title": {
           "de": "Psycholog*innen",
           "en": "Psychologists"
          }
         },
         {
          "id": "soc-psychology-branches",
          "title": {
           "de": "Gebiete der Psychologie",
           "en": "Branches of Psychology"
          }
         },
         {
          "id": "soc-psychology-concepts",
          "title": {
           "de": "Psychologische Begriffe",
           "en": "Psychological Concepts"
          }
         }
        ],
        "def": "CHILDREN"
       },
       {
        "id": "soc-sociology",
        "title": {
         "de": "Soziologie",
         "en": "Sociology"
        },
        "children": [
         {
          "id": "soc-sociology-sociologists",
          "title": {
           "de": "Soziolog*en",
           "en": "Sociologists"
          }
         },
         {
          "id": "soc-sociology-branches",
          "title": {
           "de": "Gebiete der Soziologie",
           "en": "Branches of Sociology"
          }
         },
         {
          "id": "soc-sociology-concepts",
          "title": {
           "de": "Soziologische Begriffe",
           "en": "Sociological Concepts"
          }
         }
        ],
        "def": "CHILDREN"
       },
       {
        "id": "soc-economics",
        "title": {
         "de": "Ökonomie",
         "en": "Economics"
        },
        "children": [
         {
          "id": "soc-economics-economists",
          "title": {
           "de": "Ökonomen",
           "en": "Economists"
          }
         },
         {
          "id": "soc-economics-branches",
          "title": {
           "de": "Gebiete der Ökonomie",
           "en": "Branches of Economics"
          }
         },
         {
          "id": "soc-economics-concepts",
          "title": {
           "de": "Begriffe der Ökonomie",
           "en": "Concepts of Economy"
          }
         }
        ],
        "def": "CHILDREN"
       },
       {
        "id": "soc-law",
        "title": {
         "de": "Jura",
         "en": "Law"
        },
        "children": [
         {
          "id": "soc-law-cases",
          "title": {
           "de": "Gerichtsfälle",
           "en": "Law cases"
          }
         },
         {
          "id": "soc-law-lawyers",
          "title": {
           "de": "Juristen",
           "en": "Lawyers"
          }
         },
         {
          "id": "soc-law-justices",
          "title": {
           "de": "Richter",
           "en": "Justices"
          }
         },
         {
          "id": "soc-law-branches",
          "title": {
           "de": "Gebiete der Jura",
           "en": "Branches of Law"
          }
         },
         {
          "id": "-concepts",
          "title": {
           "de": "Juristische Begriffe",
           "en": "Juridical Concepts"
          }
         }
        ],
        "def": "CHILDREN"
       }
      ]
     },
     {
      "id": "log",
      "title": {
       "de": "Mathe, Technik und Logik",
       "en": "Math, Tech and Logic"
      },
      "canLearn": false,
      "children": [
       {
        "id": "log-math",
        "title": {
         "de": "Mathematik",
         "en": "Mathematics"
        },
        "children": [
         {
          "id": "log-mathematicians",
          "title": {
           "de": "Mathematiker",
           "en": "Mathematicians"
          }
         },
         {
          "id": "log-math-branches",
          "title": {
           "de": "Gebiete der Mathematik",
           "en": "Branches of Mathematics"
          }
         },
         {
          "id": "log-math-concepts",
          "title": {
           "de": "Mathematische Begriffe",
           "en": "Mathematical Concepts"
          }
         }
        ],
        "def": "CHILDREN"
       },
       {
        "id": "log-it",
        "title": {
         "de": "Informatik",
         "en": "Information Technology"
        },
        "children": [
         {
          "id": "log-it-compscientists",
          "title": {
           "de": "Computerwissenschafter",
           "en": "Computer Scientists"
          }
         },
         {
          "id": "log-it-branches",
          "title": {
           "de": "Gebiete der Informatik",
           "en": "Branches of Computer Science"
          }
         },
         {
          "id": "log-it-concepts",
          "title": {
           "de": "Begriffe der Informatik",
           "en": "Computer Concepts"
          }
         }
        ],
        "def": "CHILDREN"
       },
       {
        "id": "log-tech",
        "title": {
         "de": "Technik & Engineering",
         "en": "Technics & Engineering"
        },
        "children": [
         {
          "id": "log-tech-inventors",
          "title": {
           "de": "Erfinder",
           "en": "Inventors"
          }
         },
         {
          "id": "log-tech-branches",
          "title": {
           "de": "Gebiete der Technik",
           "en": "Branches of Technics"
          }
         },
         {
          "id": "log-tech-concepts",
          "title": {
           "de": "Technische Begriffe",
           "en": "Technical Concepts"
          }
         }
        ],
        "def": "CHILDREN"
       },
       {
        "id": "log-logic",
        "title": {
         "de": "Logik",
         "en": "Logic"
        },
        "children": [
         {
          "id": "log-logic-logicians",
          "title": {
           "de": "Logiker",
           "en": "Logicians"
          }
         },
         {
          "id": "log-logic-branches",
          "title": {
           "de": "Gebiete der Logik",
           "en": "Branches of Logic"
          }
         },
         {
          "id": "log-logic-concepts",
          "title": {
           "de": "Begriffe der Logik",
           "en": "Concepts of Logic"
          }
         }
        ],
        "def": "CHILDREN"
       }
      ]
     }
    ],
    "image": "https://images.unsplash.com/photo-1507576566681-1932a6a38099?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=crop&w=600&q=80"
   };