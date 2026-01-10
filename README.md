# Jim App - Gym Workout Planner

A mobile application for planning and generating weekly workout routines using React Native (Expo) and NestJS backend with LLM integration for workout generation.

## Features

- **Simple UI** - Clean and intuitive mobile interface
- **Weekly Workout Planning** - View and manage your weekly workout schedule
- **LLM-Powered Generation** - Generate personalized workouts using AI
- **Exercise Tracking** - Track sets, reps, and weights for each exercise
- **RESTful API** - Robust backend built with NestJS

## Tech Stack

### Frontend
- **React Native** with **Expo** (~51.0.0)
- **TypeScript**
- **React Navigation** for navigation
- **Axios** for API calls

### Backend
- **NestJS** - Progressive Node.js framework
- **PostgreSQL** with **Prisma** - Database and ORM
- **Supabase** - Ready for cloud PostgreSQL hosting
- **TypeScript**
- **Class Validator** - DTO validation

## Project Structure

```
Jim-App-main/
├── frontend/          # React Native Expo app
│   ├── src/
│   │   ├── screens/  # App screens
│   │   ├── services/ # API services
│   │   └── types/    # TypeScript types
│   └── App.tsx       # Main app component
├── backend/          # NestJS API
│   ├── prisma/       # Prisma schema
│   └── src/
│       ├── workouts/ # Workout module
│       └── main.ts   # Application entry point
└── README.md
```

## Getting Started

### Prerequisites

- **Node.js** (v18 or higher)
- **npm** or **yarn**
- **PostgreSQL** (local installation) or **Supabase** account (for cloud database)
- **Expo CLI** (will be installed with frontend dependencies)

### Backend Setup

1. Navigate to the backend directory:
```bash
cd backend
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
Create a `.env` file in the `backend` directory:

**Option A: Using Supabase (Recommended for production)**
```env
PORT=3000
DATABASE_URL=postgresql://postgres:[YOUR-PASSWORD]@db.[YOUR-PROJECT-REF].supabase.co:5432/postgres
NODE_ENV=development
OPENAI_API_KEY=your_openai_api_key_here  # Optional for LLM integration
```

**Option B: Using Local PostgreSQL**
```env
PORT=3000
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/jim_app
NODE_ENV=development
OPENAI_API_KEY=your_openai_api_key_here  # Optional for LLM integration
```

4. Set up your database:
   - **For Supabase**: 
     1. Create a free account at [supabase.com](https://supabase.com)
     2. Create a new project
     3. Go to Settings → Database
     4. Copy the connection string and paste it as `DATABASE_URL` in your `.env` file
   - **For Local PostgreSQL**:
     1. Install PostgreSQL locally
     2. Create a database: `createdb jim_app`
     3. Make sure PostgreSQL is running

5. Generate Prisma Client and run migrations:
```bash
# Generate Prisma Client (creates types based on your schema)
npx prisma generate

# Create and apply database migrations
npx prisma migrate dev --name init

# (Optional) Open Prisma Studio to view/edit your database
npx prisma studio
```

6. Start the development server:
```bash
npm run start:dev
```

The API will be available at `http://localhost:3000/api`

### Frontend Setup

1. Navigate to the frontend directory:
```bash
cd frontend
```

2. Install dependencies:
```bash
npm install
```

3. Update the API URL in `src/services/workoutService.ts` if needed:
   - For Android emulator: Use `http://10.0.2.2:3000/api`
   - For iOS simulator: Use `http://localhost:3000/api`
   - For physical device: Use your computer's IP address (e.g., `http://192.168.1.100:3000/api`)

4. Start the Expo development server:
```bash
npm start
```

5. Run on your device:
   - Press `a` for Android emulator
   - Press `i` for iOS simulator
   - Scan QR code with Expo Go app on your physical device

## API Endpoints

### Workouts

- `GET /api/workouts` - Get all workouts
- `GET /api/workouts/weekly` - Get weekly workouts
- `GET /api/workouts/:id` - Get workout by ID
- `POST /api/workouts` - Create a new workout
- `PATCH /api/workouts/:id` - Update a workout
- `DELETE /api/workouts/:id` - Delete a workout
- `POST /api/workouts/generate` - Generate a workout using LLM

### Generate Workout Example

```json
POST /api/workouts/generate
{
  "day": "Monday",
  "preferences": {
    "focus": "upper body",
    "difficulty": "intermediate",
    "duration": 60
  }
}
```

## Database Setup with Supabase

### Setting up Supabase

1. **Create a Supabase Account**
   - Go to [supabase.com](https://supabase.com) and sign up for a free account

2. **Create a New Project**
   - Click "New Project"
   - Choose your organization
   - Enter project details (name, database password, region)
   - Wait for the project to be created (takes ~2 minutes)

3. **Get Your Connection String**
   - Go to Project Settings → Database
   - Find the "Connection string" section
   - Copy the "URI" connection string (it looks like: `postgresql://postgres:[YOUR-PASSWORD]@db.xxxxx.supabase.co:5432/postgres`)
   - Replace `[YOUR-PASSWORD]` with your actual database password

4. **Add to .env file**
   ```env
   DATABASE_URL=postgresql://postgres:your_password@db.xxxxx.supabase.co:5432/postgres
   ```

5. **Database Schema**
   - Run Prisma migrations to create the database schema:
     ```bash
     npx prisma migrate dev --name init
     ```
   - This creates the `workouts` and `exercises` tables
   - Prisma migrations are version-controlled and safe for production

### Local PostgreSQL Setup (Alternative)

If you prefer to use a local PostgreSQL database:

1. **Install PostgreSQL**
   - Windows: Download from [postgresql.org](https://www.postgresql.org/download/windows/)
   - macOS: `brew install postgresql`
   - Linux: `sudo apt-get install postgresql`

2. **Create Database**
   ```bash
   createdb jim_app
   ```

3. **Update .env**
   ```env
   DATABASE_URL=postgresql://postgres:your_password@localhost:5432/jim_app
   ```

4. **Run Prisma migrations**
   ```bash
   npx prisma migrate dev --name init
   ```

## LLM Integration

The app currently uses a rule-based workout generator. To integrate with an LLM (OpenAI, Anthropic, etc.):

1. Add your API key to the `.env` file
2. Update `backend/src/workouts/workout-generator.service.ts`
3. Implement the `generateWorkoutWithLLM` method

Example with OpenAI:
```typescript
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async generateWorkoutWithLLM(dto: GenerateWorkoutDto) {
  const response = await openai.chat.completions.create({
    model: "gpt-4",
    messages: [
      {
        role: "system",
        content: "You are a fitness trainer. Generate workout plans in JSON format."
      },
      {
        role: "user",
        content: `Generate a ${dto.preferences?.focus} workout for ${dto.day}`
      }
    ]
  });
  // Parse and return workout
}
```

## Development

### Backend Commands
- `npm run start:dev` - Start development server with hot reload
- `npm run build` - Build for production
- `npm run start:prod` - Run production build
- `npm run test` - Run unit tests
- `npm run lint` - Lint code

### Prisma Commands
- `npx prisma generate` - Generate Prisma Client (run after schema changes)
- `npx prisma migrate dev` - Create and apply a new migration
- `npx prisma migrate deploy` - Apply migrations in production
- `npx prisma studio` - Open Prisma Studio (visual database browser)
- `npx prisma db push` - Push schema changes without migrations (dev only)

### Frontend Commands
- `npm start` - Start Expo development server
- `npm run android` - Run on Android
- `npm run ios` - Run on iOS
- `npm run web` - Run on web

## Next Steps

- [ ] Add user authentication
- [ ] Implement workout history tracking
- [ ] Add progress photos
- [ ] Integrate with fitness wearables
- [ ] Add social features (share workouts)
- [ ] Implement workout analytics
- [ ] Add exercise video demonstrations

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

MIT License

## Support

For issues and questions, please open an issue on GitHub.
