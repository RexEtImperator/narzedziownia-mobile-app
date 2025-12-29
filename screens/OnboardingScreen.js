import React, { useState, useRef } from 'react';
import { View, Text, Image, StyleSheet, Dimensions, FlatList, Pressable } from 'react-native';
import { useTheme } from '../lib/theme';
import { setStorageItem, KEYS } from '../lib/storage';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import ThemedButton from '../components/ThemedButton';

const { width, height } = Dimensions.get('window');

export default function OnboardingScreen({ onFinish }) {
  const { colors, isDark } = useTheme();
  const [activeIndex, setActiveIndex] = useState(0);
  const flatListRef = useRef(null);

  // Dane slajdów
  const slides = [
    {
      id: '1',
      image: require('../assets/onboarding.png'), // Użytkownik musi dodać ten plik
      title: 'Witaj w aplikacji!',
      description: '',
      isLast: false,
    },
    {
      id: '2',
      image: null, // Drugi ekran ma tylko tekst, lub można dać inną grafikę
      title: 'Dziękujemy!',
      description: 'Cieszymy się, że jesteś z nami. Życzymy owocnej pracy z aplikacją.',
      isLast: true,
    },
  ];

  const handleScroll = (event) => {
    const slideSize = event.nativeEvent.layoutMeasurement.width;
    const index = event.nativeEvent.contentOffset.x / slideSize;
    const roundIndex = Math.round(index);
    setActiveIndex(roundIndex);
  };

  const finishOnboarding = async () => {
    try {
      await setStorageItem(KEYS.HAS_SEEN_ONBOARDING, 'true');
      if (onFinish) onFinish();
    } catch (error) {
      console.log('Error saving onboarding status', error);
      if (onFinish) onFinish();
    }
  };

  const renderItem = ({ item }) => {
    return (
      <View style={[styles.slide, { backgroundColor: colors.background }]}>
        {item.image ? (
          <Image source={item.image} style={styles.image} resizeMode="cover" />
        ) : (
          <View style={[styles.imagePlaceholder, { backgroundColor: colors.card }]}>
             {/* Pusty widok lub inna grafika dla drugiego ekranu */}
             <Text style={{fontSize: 60}}>🎉</Text>
          </View>
        )}
        
        <View style={styles.contentContainer}>
          <Text style={[styles.title, { color: colors.text }]}>{item.title}</Text>
          {item.description ? (
            <Text style={[styles.description, { color: colors.muted }]}>{item.description}</Text>
          ) : null}

          {item.isLast && (
            <ThemedButton
              title="Przejdź do logowania"
              onPress={finishOnboarding}
              style={styles.button}
              textStyle={styles.buttonText}
            />
          )}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <FlatList
        ref={flatListRef}
        data={slides}
        renderItem={renderItem}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={handleScroll}
        keyExtractor={(item) => item.id}
        bounces={false}
        style={{ flex: 1 }}
      />
      
      {/* Wskaźniki (kropki) */}
      <View style={styles.pagination}>
        {slides.map((_, index) => (
          <Pressable
            key={index}
            onPress={() => {
              flatListRef.current?.scrollToOffset({ offset: index * width, animated: true });
            }}
            hitSlop={10}
            style={({ pressed }) => [
              styles.dot,
              { 
                backgroundColor: index === activeIndex ? colors.primary : colors.border,
                opacity: pressed ? 0.7 : 1
              }
            ]}
          />
        ))}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  slide: {
    width: width,
    height: height,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 100, // Miejsce na paginację
  },
  image: {
    width: width * 0.8,
    height: height * 0.5,
    marginBottom: 40,
    borderRadius: 20,
  },
  imagePlaceholder: {
    width: width * 0.8,
    height: height * 0.4,
    marginBottom: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contentContainer: {
    paddingHorizontal: 40,
    alignItems: 'center',
    width: '100%',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 16,
  },
  description: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 24,
  },
  button: {
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  pagination: {
    position: 'absolute',
    bottom: 50,
    flexDirection: 'row',
    alignSelf: 'center',
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginHorizontal: 5,
  },
});
