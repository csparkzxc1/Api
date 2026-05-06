package app.pulsewatch

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import app.pulsewatch.ui.AppViewModel
import app.pulsewatch.ui.RootScreen

class MainActivity : ComponentActivity() {

    private val viewModel by lazy {
        AppViewModel(application as PulseWatchApp)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            MaterialTheme {
                Surface(modifier = Modifier.fillMaxSize()) {
                    val state by viewModel.state.collectAsState()
                    RootScreen(state = state, viewModel = viewModel)
                }
            }
        }
    }
}
